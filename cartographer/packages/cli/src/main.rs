use clap::Parser;
use git2::{Repository, Time};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(name = "cartographer", about = "Map your codebase")]
struct Args {
    /// GitHub URL or local path
    input: String,

    /// Where to clone (if URL)
    #[arg(long, default_value = "/tmp/cartographer-repo")]
    clone_dir: String,

    /// How many days of git history to scan
    #[arg(long, default_value_t = 90)]
    history_days: i64,
}

#[derive(Serialize, Deserialize, Debug)]
struct FileEntry {
    path: String,
    language: String,
    size_bytes: u64,
    churn: u32,
    authors: u32,
}

#[derive(Debug, Default)]
struct ChurnEntry {
    commits: u32,
    authors: HashSet<String>,
}

fn detect_language(path: &Path) -> String {
    match path.extension().and_then(|e| e.to_str()) {
        Some("rs") => "rust",
        Some("ts") | Some("tsx") => "typescript",
        Some("js") | Some("jsx") => "javascript",
        Some("py") => "python",
        Some("go") => "go",
        Some("java") => "java",
        Some("cpp") | Some("cc") | Some("cxx") => "cpp",
        Some("c") => "c",
        Some("rb") => "ruby",
        Some("cs") => "csharp",
        Some("md") => "markdown",
        Some("json") => "json",
        Some("toml") => "toml",
        Some("yaml") | Some("yml") => "yaml",
        _ => "unknown",
    }
    .to_string()
}

fn is_ignored(path: &Path) -> bool {
    let ignored_dirs = [
        "node_modules", ".git", "target", "dist", "build",
        ".next", "__pycache__", ".cache", "vendor",
    ];
    path.components().any(|c| {
        ignored_dirs.contains(&c.as_os_str().to_str().unwrap_or(""))
    })
}

fn clone_repo(url: &str, dest: &str) -> Result<PathBuf, git2::Error> {
    let dest_path = PathBuf::from(dest);
    if dest_path.exists() {
        std::fs::remove_dir_all(&dest_path).ok();
    }
    eprintln!("Cloning {} ...", url);
    git2::Repository::clone(url, &dest_path)?;
    eprintln!("Done cloning.");
    Ok(dest_path)
}

fn seconds_ago(days: i64) -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    now - (days * 86400)
}

fn parse_churn(repo_path: &Path, history_days: i64) -> HashMap<String, ChurnEntry> {
    let repo = match Repository::open(repo_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Could not open repo for git history: {}", e);
            return HashMap::new();
        }
    };

    let cutoff = seconds_ago(history_days);
    let mut churn: HashMap<String, ChurnEntry> = HashMap::new();

    // Walk commits from HEAD
    let mut revwalk = match repo.revwalk() {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };

    if revwalk.push_head().is_err() {
        return HashMap::new();
    }

    let mut commit_count = 0;

    for oid in revwalk.flatten() {
        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Stop if older than cutoff
        if commit.time().seconds() < cutoff {
            break;
        }

        commit_count += 1;
        let author = commit
            .author()
            .email()
            .unwrap_or("unknown")
            .to_string();

        // Diff this commit against its first parent
        let tree = match commit.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let parent_tree = commit
            .parent(0)
            .ok()
            .and_then(|p| p.tree().ok());

        let diff = match repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&tree),
            None,
        ) {
            Ok(d) => d,
            Err(_) => continue,
        };

        // Collect touched files
        for delta in diff.deltas() {
            if let Some(path) = delta.new_file().path() {
                let path_str = path.to_string_lossy().to_string();
                let entry = churn.entry(path_str).or_default();
                entry.commits += 1;
                entry.authors.insert(author.clone());
            }
        }
    }

    eprintln!("Scanned {} commits in last {} days.", commit_count, history_days);
    churn
}

fn walk_repo(root: &Path, churn: &HashMap<String, ChurnEntry>) -> Vec<FileEntry> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let abs_path = entry.path();
        if is_ignored(abs_path) {
            continue;
        }

        let rel_path = abs_path
            .strip_prefix(root)
            .unwrap_or(abs_path)
            .to_string_lossy()
            .to_string();

        let size_bytes = abs_path.metadata().map(|m| m.len()).unwrap_or(0);
        let language = detect_language(abs_path);

        let (churn_count, author_count) = churn
            .get(&rel_path)
            .map(|e| (e.commits, e.authors.len() as u32))
            .unwrap_or((0, 0));

        files.push(FileEntry {
            path: rel_path,
            language,
            size_bytes,
            churn: churn_count,
            authors: author_count,
        });
    }

    // Sort by churn descending so hottest files appear first
    files.sort_by(|a, b| b.churn.cmp(&a.churn));
    files
}

fn main() {
    let args = Args::parse();

    let repo_root = if args.input.starts_with("http://") || args.input.starts_with("https://") {
        match clone_repo(&args.input, &args.clone_dir) {
            Ok(path) => path,
            Err(e) => {
                eprintln!("Failed to clone: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        PathBuf::from(&args.input)
    };

    eprintln!("Parsing git history ({} days)...", args.history_days);
    let churn = parse_churn(&repo_root, args.history_days);

    eprintln!("Walking file tree...");
    let files = walk_repo(&repo_root, &churn);

    // Top 10 churners for a quick sanity check to stderr
    eprintln!("\n--- Top churners ---");
    for f in files.iter().take(10) {
        eprintln!("  {} | churn={} authors={}", f.path, f.churn, f.authors);
    }
    eprintln!("--------------------\n");

    let output = serde_json::json!({
        "repo": args.input,
        "root": repo_root.to_string_lossy(),
        "history_days": args.history_days,
        "file_count": files.len(),
        "files": files
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}