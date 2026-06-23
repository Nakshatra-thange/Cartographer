use clap::Parser; // cli argument parser
use serde::{Deserialize, Serialize}; 
// json serializer and desrializer
use std::path::{Path, PathBuf}; //&str and String
use walkdir::WalkDir; // recursive code 

#[derive(Parser, Debug)]
#[command(name = "cartographer", about = "Map your codebase")]
struct Args {
    input: String,
    #[arg(long, default_value = "/tmp/cartographer-repo")]
    clone_dir: String,
}
#[derive(Serialize, Deserialize, Debug)]
struct FileEntry {
    path: String,
    language: String,
    size_bytes: u64,
}
fn detect_language(path: &Path)->String{
    match path.extension().and_then(|e| e.to_str()){
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
    }.to_string()
}
fn is_ignored(path: &Path)-> bool {
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
fn walk_repo(root: &Path) -> Vec<FileEntry> {
    let mut files = Vec::new(); // create []

    for entry in WalkDir::new(root) //start iterating
        .into_iter()           //create iterator
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let abs_path = entry.path();

        if is_ignored(abs_path) {
            continue;
        }

        // Relative path from repo root
        let rel_path = abs_path
            .strip_prefix(root)
            .unwrap_or(abs_path)
            .to_string_lossy() //path to string 
            .to_string();

        let size_bytes = abs_path.metadata().map(|m| m.len()).unwrap_or(0);
        let language = detect_language(abs_path);

        files.push(FileEntry {
            path: rel_path,
            language,
            size_bytes,
        });
    }

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

    let files = walk_repo(&repo_root);

    let output = serde_json::json!({
        "repo": args.input,
        "root": repo_root.to_string_lossy(),
        "file_count": files.len(),
        "files": files
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}