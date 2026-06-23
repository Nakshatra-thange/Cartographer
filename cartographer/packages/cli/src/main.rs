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
