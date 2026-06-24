mod call_graph;

use call_graph::build_call_graph;
use clap::Parser;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(name = "cartographer", about = "Map your codebase")]
struct Args {
    /// GitHub URL or local path
    input: String,

    #[arg(long, default_value = "/tmp/cartographer-repo")]
    clone_dir: String,

    #[arg(long, default_value_t = 90)]
    history_days: i64,

    /// Write output to this file instead of stdout
    #[arg(long)]
    out: Option<String>,
}

// ── Graph model ───────────────────────────────────────────────────────────────

/// A single node in the graph. This is the contract between the Rust CLI
/// and the Node API. Don't change field names without updating both sides.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GraphNode {
    /// Stable unique key — repo-relative file path
    pub id: String,
    pub path: String,
    pub language: String,
    pub size_bytes: u64,
    /// Number of commits touching this file in the last N days
    pub churn: u32,
    /// Number of distinct authors who touched this file
    pub authors: u32,
    /// Files that import THIS file
    pub in_degree: u32,
    /// Files that THIS file imports
    pub out_degree: u32,
    /// in_degree + out_degree — primary sort/size signal for the graph
    pub coupling: u32,
    /// Pre-computed risk score: churn * coupling. 0 if either is 0.
    pub risk_score: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub import_type: String,
}

/// The top-level output written to disk / stdout.
/// Everything downstream (Node API, React app) reads this shape.
#[derive(Serialize, Deserialize, Debug)]
pub struct Graph {
    pub repo: String,
    pub generated_at: u64, // unix timestamp
    pub history_days: i64,
    pub node_count: usize,
    pub edge_count: usize,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

// ── Internal types ────────────────────────────────────────────────────────────

#[derive(Debug, Default)]
struct ChurnEntry {
    commits: u32,
    authors: HashSet<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn detect_language(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("rs") => "rust",
        Some("ts") => "typescript",
        Some("tsx") => "typescript",
        Some("js") | Some("jsx") | Some("mjs") | Some("cjs") => "javascript",
        Some("py") => "python",
        Some("go") => "go",
        Some("java") => "java",
        Some("cpp") | Some("cc") | Some("cxx") => "cpp",
        Some("c") | Some("h") => "c",
        Some("rb") => "ruby",
        Some("cs") => "csharp",
        Some("md") | Some("mdx") => "markdown",
        Some("json") => "json",
        Some("toml") => "toml",
        Some("yaml") | Some("yml") => "yaml",
        Some("css") | Some("scss") | Some("sass") => "css",
        Some("html") | Some("htm") => "html",
        _ => "unknown",
    }
}

fn is_ignored(path: &Path) -> bool {
    const IGNORED: &[&str] = &[
        "node_modules", ".git", "target", "dist", "build",
        ".next", "__pycache__", ".cache", "vendor", ".turbo",
        "coverage", ".nyc_output", "out",
    ];
    path.components()
        .any(|c| IGNORED.contains(&c.as_os_str().to_str().unwrap_or("")))
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

// ── Git operations ────────────────────────────────────────────────────────────

fn clone_repo(url: &str, dest: &str) -> Result<PathBuf, git2::Error> {
    let dest_path = PathBuf::from(dest);
    if dest_path.exists() {
        std::fs::remove_dir_all(&dest_path).ok();
    }
    eprintln!("[1/4] Cloning {} ...", url);
    git2::Repository::clone(url, &dest_path)?;
    eprintln!("      Done.");
    Ok(dest_path)
}

fn parse_churn(repo_path: &Path, history_days: i64) -> HashMap<String, ChurnEntry> {
    let repo = match Repository::open(repo_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Warning: could not open repo for history: {}", e);
            return HashMap::new();
        }
    };

    let cutoff = unix_now() as i64 - (history_days * 86400);
    let mut churn: HashMap<String, ChurnEntry> = HashMap::new();

    let mut revwalk = match repo.revwalk() {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };

    if revwalk.push_head().is_err() {
        return HashMap::new();
    }

    let mut commit_count = 0u32;

    for oid in revwalk.flatten() {
        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if commit.time().seconds() < cutoff {
            break;
        }

        commit_count += 1;
        let author = commit.author().email().unwrap_or("unknown").to_string();

        let tree = match commit.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let diff = match repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None) {
            Ok(d) => d,
            Err(_) => continue,
        };

        for delta in diff.deltas() {
            if let Some(p) = delta.new_file().path() {
                let key = p.to_string_lossy().to_string();
                let e = churn.entry(key).or_default();
                e.commits += 1;
                e.authors.insert(author.clone());
            }
        }
    }

    eprintln!("      Scanned {} commits.", commit_count);
    churn
}

// ── File walk ─────────────────────────────────────────────────────────────────

struct RawFile {
    path: String,
    language: String,
    size_bytes: u64,
    churn: u32,
    authors: u32,
}

fn walk_repo(root: &Path, churn: &HashMap<String, ChurnEntry>) -> Vec<RawFile> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let abs = entry.path();
        if is_ignored(abs) {
            continue;
        }

        let rel = abs
            .strip_prefix(root)
            .unwrap_or(abs)
            .to_string_lossy()
            .to_string();

        let size_bytes = abs.metadata().map(|m| m.len()).unwrap_or(0);
        let language = detect_language(abs).to_string();

        let (churn_count, author_count) = churn
            .get(&rel)
            .map(|e| (e.commits, e.authors.len() as u32))
            .unwrap_or((0, 0));

        files.push(RawFile { path: rel, language, size_bytes, churn: churn_count, authors: author_count });
    }

    files
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    let args = Args::parse();

    // ── Step 1: Clone or use local ───────────────────────────────────────────
    let repo_root = if args.input.starts_with("http://") || args.input.starts_with("https://") {
        match clone_repo(&args.input, &args.clone_dir) {
            Ok(p) => p,
            Err(e) => { eprintln!("Clone failed: {}", e); std::process::exit(1); }
        }
    } else {
        PathBuf::from(&args.input)
    };

    // ── Step 2: Git history ──────────────────────────────────────────────────
    eprintln!("[2/4] Parsing git history ({} days)...", args.history_days);
    let churn = parse_churn(&repo_root, args.history_days);

    // ── Step 3: File walk ────────────────────────────────────────────────────
    eprintln!("[3/4] Walking file tree...");
    let raw_files = walk_repo(&repo_root, &churn);
    eprintln!("      {} files found.", raw_files.len());

    // ── Step 4: Call graph ───────────────────────────────────────────────────
    eprintln!("[4/4] Building call graph...");
    let file_pairs: Vec<(String, String)> = raw_files
        .iter()
        .map(|f| (f.path.clone(), f.language.clone()))
        .collect();

    let raw_edges = build_call_graph(&file_pairs, &repo_root);
    eprintln!("      {} edges found.", raw_edges.len());

    // ── Compute degrees ──────────────────────────────────────────────────────
    let mut in_deg: HashMap<String, u32> = HashMap::new();
    let mut out_deg: HashMap<String, u32> = HashMap::new();

    for edge in &raw_edges {
        *out_deg.entry(edge.from.clone()).or_insert(0) += 1;
        *in_deg.entry(edge.to.clone()).or_insert(0) += 1;
    }

    // ── Assemble nodes ───────────────────────────────────────────────────────
    let mut nodes: Vec<GraphNode> = raw_files
        .into_iter()
        .map(|f| {
            let ind  = *in_deg.get(&f.path).unwrap_or(&0);
            let outd = *out_deg.get(&f.path).unwrap_or(&0);
            let coupling = ind + outd;
            let risk_score = f.churn * coupling;
            GraphNode {
                id: f.path.clone(),
                path: f.path,
                language: f.language,
                size_bytes: f.size_bytes,
                churn: f.churn,
                authors: f.authors,
                in_degree: ind,
                out_degree: outd,
                coupling,
                risk_score,
            }
        })
        .collect();

    // Primary sort: coupling desc. Tie-break: churn desc.
    nodes.sort_by(|a, b| {
        b.coupling.cmp(&a.coupling).then(b.churn.cmp(&a.churn))
    });

    let edges: Vec<GraphEdge> = raw_edges
        .into_iter()
        .map(|e| GraphEdge { from: e.from, to: e.to, import_type: e.import_type })
        .collect();

    // ── Sanity output to stderr ──────────────────────────────────────────────
    eprintln!("\n┌─ Top 10 by coupling ──────────────────────────────────────┐");
    for n in nodes.iter().take(10) {
        eprintln!("│  {:50} coupling={:3} churn={:3}", n.path, n.coupling, n.churn);
    }
    eprintln!("└───────────────────────────────────────────────────────────┘");

    eprintln!("\n┌─ Top 5 danger zone (churn × coupling) ────────────────────┐");
    let mut danger = nodes.iter().collect::<Vec<_>>();
    danger.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
    for n in danger.iter().take(5) {
        eprintln!("│  {:50} risk={:5} (churn={} coupling={})", n.path, n.risk_score, n.churn, n.coupling);
    }
    eprintln!("└───────────────────────────────────────────────────────────┘\n");

    // ── Build final graph ────────────────────────────────────────────────────
    let graph = Graph {
        repo: args.input,
        generated_at: unix_now(),
        history_days: args.history_days,
        node_count: nodes.len(),
        edge_count: edges.len(),
        nodes,
        edges,
    };

    let json = serde_json::to_string_pretty(&graph).unwrap();

    match args.out {
        Some(path) => {
            std::fs::write(&path, &json).expect("Failed to write output file");
            eprintln!("Graph written to {}", path);
        }
        None => println!("{}", json),
    }
}