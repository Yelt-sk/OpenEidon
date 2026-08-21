# Deep Research

A multi-hop research agent that searches across your indexed documents, cross-references information, and returns answers with citations. It reasons through complex queries step by step, pulling context from multiple sources in your local knowledge base.

## Quickstart (5 minutes)

### 1. Install and initialize

```bash
git clone https://github.com/Yelt-sk/OpenEidon.git
cd OpenEidon
uv sync --extra dev
eidon init --preset deep-research
```

This writes a pre-configured `~/.openeidon/config.toml` for the deep research agent.

### 2. Index your documents

```bash
# Install Ollama: https://ollama.com
ollama pull qwen3.5:9b

# Index a directory of files
eidon memory index ./docs/
eidon memory index ~/Documents/papers/
```

OpenEidon chunks the content and stores it in a local SQLite/FTS5 database. Supported formats include `.txt`, `.md`, `.pdf`, `.py`, `.json`, `.csv`, and more.

### 3. Ask a research question

```bash
eidon ask "Summarize all documents about transformer architectures"
```

The deep research agent will:

1. Search your indexed documents for relevant chunks
2. Reason across multiple sources (up to 8 hops)
3. Synthesize a coherent answer with references to source documents

## CLI Commands

```bash
# Ask a question (uses deep_research agent by default with this config)
eidon ask "What meetings did I have with Alice last month?"

# Explicitly specify the agent
eidon ask --agent deep_research "Compare the approaches described in paper-a.pdf and paper-b.pdf"

# Index more documents
eidon memory index ~/Downloads/reports/
eidon memory index ./notes.md

# Search memory directly
eidon memory search "project timeline"
eidon memory search -k 20 "budget estimates"

# Check what's indexed
eidon memory stats
```

## Configuration Reference

The preset writes this to `~/.openeidon/config.toml`:

```toml
[engine]
default = "ollama"

[intelligence]
default_model = "qwen3.5:9b"
temperature = 0.3               # Low temperature for factual research

[agent]
default_agent = "deep_research"
max_turns = 8                   # Multi-hop reasoning steps

[tools]
enabled = ["knowledge_search", "knowledge_sql", "scan_chunks", "think", "web_search"]

[tools.storage]
default_backend = "sqlite"
```

### Key settings

| Setting | Default | Description |
|---------|---------|-------------|
| `intelligence.default_model` | `qwen3.5:9b` | The model used for reasoning. Larger models (e.g., `qwen3.5:35b`) give better results on complex queries. |
| `intelligence.temperature` | `0.3` | Low temperature keeps answers factual. Increase for more creative synthesis. |
| `agent.max_turns` | `8` | Maximum reasoning hops. Increase for deeply nested research tasks. |
| `tools.enabled` | 5 tools | `knowledge_search` (semantic), `knowledge_sql` (structured), `scan_chunks` (browse), `think` (reasoning scratchpad), `web_search` (online fallback). |
| `tools.storage.default_backend` | `sqlite` | FTS5-backed full-text search. Also supports `faiss`, `colbert`, `bm25`, and `hybrid`. |

## Example Queries

```bash
# Summarize across multiple documents
eidon ask "Summarize all emails about the Q3 budget review"

# Cross-reference sources
eidon ask "What do papers A and B agree on regarding attention mechanisms?"

# Find specific information
eidon ask "What meetings did I have with Alice last month?"

# Extract structured data
eidon ask "List all action items from the meeting notes in ~/Documents/meetings/"

# Research with web fallback
eidon ask "Compare our internal benchmarks with the latest published results"
```

## Indexing Different Data Sources

### Local files and directories

```bash
# Recursively index a directory
eidon memory index ~/Documents/

# Single file
eidon memory index ./report.pdf

# Custom chunk size for long documents
eidon memory index ./paper.pdf --chunk-size 1024 --chunk-overlap 128
```

### PDFs

PDFs are automatically extracted and chunked. For best results with scanned PDFs, ensure they have been OCR-processed.

```bash
eidon memory index ~/Papers/*.pdf
```

### Web pages

Use the `web_search` tool (enabled by default in this config) to pull in online sources at query time. For persistent indexing of web content, download pages first:

```bash
curl -s https://example.com/article | eidon memory index --stdin --source "example.com"
```

### Code repositories

```bash
eidon memory index ./src/ --chunk-size 256
```

Smaller chunk sizes work better for code, where each function or class is a natural unit.

## Troubleshooting

**"No results found"** -- Make sure you have indexed documents first with `eidon memory index`. Check indexed content with `eidon memory stats`.

**Answers are too vague** -- Try increasing `max_turns` in the config (e.g., `12` or `15`) to give the agent more reasoning steps. You can also try a larger model like `qwen3.5:35b`.

**Slow responses** -- The agent makes multiple search passes. Each turn involves a model call. Reduce `max_turns` or use a smaller model (`qwen3.5:4b`) for faster but less thorough results.

**Web search not working** -- The `web_search` tool requires the Tavily API. Install with `uv sync --extra tools-search` and set `TAVILY_API_KEY`.

**Wrong chunks retrieved** -- Try re-indexing with different chunk sizes. For technical documents, smaller chunks (`256`) often retrieve more precisely. For narrative text, larger chunks (`1024`) preserve more context.
