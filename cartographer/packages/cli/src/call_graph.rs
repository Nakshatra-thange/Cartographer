use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tree_sitter::{Language, Node, Parser};

// ── Public types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub import_type: String,
}

// ── Language handles ─────────────────────────────────────────────────────────

pub fn js_language() -> Language {
    tree_sitter_javascript::language()
}

pub fn ts_language() -> Language {
    tree_sitter_typescript::language_typescript()
}

pub fn tsx_language() -> Language {
    tree_sitter_typescript::language_tsx()
}

// ── Import extraction ────────────────────────────────────────────────────────

/// Parse one source file and return all raw import strings found.
/// Raw means unresolved — "./router", "express", "../lib/utils" etc.
pub fn extract_raw_imports(source: &str, lang: &Language) -> Vec<(String, &'static str)> {
    let mut parser = Parser::new();
    if parser.set_language(&lang).is_err() {
        return vec![];
    }

    let tree = match parser.parse(source, None) {
        Some(t) => t,
        None => return vec![],
    };

    let mut results = Vec::new();
    visit_node(tree.root_node(), source.as_bytes(), &mut results);
    results
}

fn visit_node<'a>(node: Node, src: &[u8], out: &mut Vec<(String, &'static str)>) {
    match node.kind() {
        // import x from './foo'
        // import './side-effect'
        // import type { T } from './types'
        "import_statement" => {
            if let Some(source_node) = node.child_by_field_name("source") {
                if let Ok(raw) = source_node.utf8_text(src) {
                    let s = strip_quotes(raw);
                    if !s.is_empty() {
                        out.push((s.to_string(), "import"));
                    }
                }
            }
        }

        // export { x } from './foo'
        // export * from './bar'
        "export_statement" => {
            if let Some(source_node) = node.child_by_field_name("source") {
                if let Ok(raw) = source_node.utf8_text(src) {
                    let s = strip_quotes(raw);
                    if !s.is_empty() {
                        out.push((s.to_string(), "export_from"));
                    }
                }
            }
        }

        // require('./foo')  — CommonJS
        "call_expression" => {
            let func_text = node
                .child_by_field_name("function")
                .and_then(|n| n.utf8_text(src).ok())
                .unwrap_or("");

            if func_text == "require" {
                if let Some(args) = node.child_by_field_name("arguments") {
                    // first named child of arguments is the string literal
                    if let Some(first) = args.named_child(0) {
                        match first.kind() {
                            // static string: require('./foo')
                            "string" => {
                                if let Ok(raw) = first.utf8_text(src) {
                                    let s = strip_quotes(raw);
                                    if !s.is_empty() {
                                        out.push((s.to_string(), "require"));
                                    }
                                }
                            }
                            // anything else (template literal, identifier) → skip
                            // "Accuracy over coverage" — dynamic requires are noise
                            _ => {}
                        }
                    }
                }
            }
        }

        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        visit_node(child, src, out);
    }
}

fn strip_quotes(s: &str) -> &str {
    s.trim().trim_matches(|c| c == '\'' || c == '"' || c == '`')
}

// ── Import resolution ────────────────────────────────────────────────────────

/// Turn a raw import string + the file it came from into a repo-relative path.
/// Returns None for:
///   - bare specifiers (node_modules): "express", "react", "lodash/merge"
///   - Node built-ins: "fs", "path", "node:fs"
///   - Unresolvable paths (file doesn't exist in repo)
pub fn resolve_import(
    from_file: &str,
    raw: &str,
    all_files: &HashMap<String, ()>,
) -> Option<String> {
    // Bare specifier — external package, skip
    if !raw.starts_with('.') && !raw.starts_with('/') {
        return None;
    }

    // Node built-in with explicit prefix
    if raw.starts_with("node:") {
        return None;
    }

    let from_dir = Path::new(from_file).parent().unwrap_or(Path::new(""));
    let joined = from_dir.join(raw);
    let normalized = normalize_path(&joined);

    // Candidate list in priority order:
    // 1. exact match (already has extension, e.g. "../foo.js")
    // 2. + each extension
    // 3. /index + each extension
    let extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

    let candidates = {
        let mut v = vec![normalized.clone()];
        for ext in &extensions {
            v.push(format!("{}{}", normalized, ext));
        }
        for ext in &extensions {
            v.push(format!("{}/index{}", normalized, ext));
        }
        v
    };

    for candidate in candidates {
        if all_files.contains_key(&candidate) {
            return Some(candidate);
        }
    }

    None
}

fn normalize_path(path: &PathBuf) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for component in path.components() {
        match component.as_os_str().to_str().unwrap_or("") {
            "." | "" => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    parts.join("/")
}

// ── Graph builder ─────────────────────────────────────────────────────────────

/// Main entry point. Given all files in the repo, build the full edge list.
pub fn build_call_graph(
    files: &[(String, String)], // (rel_path, language)
    repo_root: &Path,
) -> Vec<Edge> {
    let js = js_language();
    let ts = ts_language();
    let tsx = tsx_language();

    // Lookup set — O(1) existence checks during resolution
    let all_files: HashMap<String, ()> = files
        .iter()
        .map(|(p, _)| (p.clone(), ()))
        .collect();

    let mut edges: Vec<Edge> = Vec::new();

    for (rel_path, language) in files {
        // Pick the right grammar
        let lang = match language.as_str() {
            "javascript" => &js,
            "typescript" if rel_path.ends_with(".tsx") => &tsx,
            "typescript" => &ts,
            _ => continue,
        };

        let abs_path = repo_root.join(rel_path);
        let source = match std::fs::read_to_string(&abs_path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        // Skip very large files (minified bundles, generated code)
        if source.len() > 500_000 {
            continue;
        }

        let raw_imports = extract_raw_imports(&source, lang);

        for (raw, import_type) in raw_imports {
            if let Some(target) = resolve_import(rel_path, &raw, &all_files) {
                // No self-loops
                if target == *rel_path {
                    continue;
                }
                edges.push(Edge {
                    from: rel_path.clone(),
                    to: target,
                    import_type: import_type.to_string(),
                });
            }
        }
    }

    // Deduplicate (same from+to pair can appear multiple times via re-exports)
    edges.sort_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));
    edges.dedup_by(|a, b| a.from == b.from && a.to == b.to);

    edges
}