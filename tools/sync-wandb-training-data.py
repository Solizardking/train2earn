#!/usr/bin/env python3
"""Log the Nemo Clawd training-data index to Weights & Biases."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-data", default="site/public/site-data.json", help="Generated site-data JSON path.")
    parser.add_argument("--training-data", default="training-data", help="Training data root to attach as artifact files.")
    parser.add_argument("--project", default=os.environ.get("WANDB_PROJECT", "nemo-clawd-training-data"))
    parser.add_argument("--entity", default=os.environ.get("WANDB_ENTITY"))
    parser.add_argument("--artifact-name", default=os.environ.get("WANDB_ARTIFACT_NAME", "nemo-clawd-training-data"))
    parser.add_argument("--alias", default="latest")
    parser.add_argument("--mode", default=os.environ.get("WANDB_MODE") or ("online" if os.environ.get("WANDB_API_KEY") else "offline"))
    parser.add_argument("--max-files", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def iter_files(root: Path, limit: int) -> list[Path]:
    if not root.exists():
        return []
    files = [path for path in sorted(root.rglob("*")) if path.is_file()]
    return files[:limit]


def compact_file_rows(data: dict[str, Any]) -> list[list[Any]]:
    rows = []
    for file_info in data.get("files", [])[:1000]:
        rows.append(
            [
                file_info.get("path", ""),
                file_info.get("rootLabel", ""),
                file_info.get("kind", ""),
                int(file_info.get("rows") or file_info.get("lines") or 0),
                int(file_info.get("bytes") or 0),
                file_info.get("summary", ""),
            ]
        )
    return rows


def artifact_metadata(data: dict[str, Any]) -> dict[str, Any]:
    training_data = data.get("trainingData", {})
    return {
        "workspace": data.get("workspace"),
        "generated_at": data.get("generatedAt"),
        "totals": data.get("totals", {}),
        "training_build": training_data.get("buildStats", {}),
        "training_stages": training_data.get("stages", []),
        "policy": data.get("policy", {}),
    }


def main() -> int:
    args = build_parser().parse_args()
    workspace = Path.cwd()
    site_data_path = (workspace / args.site_data).resolve()
    training_root = (workspace / args.training_data).resolve()

    if not site_data_path.exists():
        print(f"Missing {site_data_path}. Run: node tools/build-static-site.mjs", file=sys.stderr)
        return 2

    data = load_json(site_data_path)
    training_files = iter_files(training_root, args.max_files)
    totals = data.get("totals", {})
    metrics = {
        "inventory/files": int(totals.get("files") or 0),
        "inventory/bytes": int(totals.get("bytes") or 0),
        "inventory/jsonl_rows": int(totals.get("jsonlRows") or 0),
        "training_data/files": len(training_files),
    }

    if args.dry_run:
        print(
            json.dumps(
                {
                    "project": args.project,
                    "entity": args.entity,
                    "mode": args.mode,
                    "artifact_name": args.artifact_name,
                    "site_data": str(site_data_path),
                    "training_files": [str(path.relative_to(workspace)) for path in training_files],
                    "metrics": metrics,
                },
                indent=2,
            )
        )
        return 0

    try:
        import wandb
    except ImportError:
        print("Missing Python package: wandb. Install with: python3 -m pip install wandb", file=sys.stderr)
        return 2

    run_config = {
        "site_data": str(site_data_path.relative_to(workspace)),
        "training_data": str(training_root.relative_to(workspace)),
        "artifact_name": args.artifact_name,
        "build_stats": data.get("trainingData", {}).get("buildStats", {}),
    }

    with wandb.init(
        project=args.project,
        entity=args.entity,
        job_type="dataset-index",
        name="nemo-clawd-training-data-index",
        mode=args.mode,
        config=run_config,
        tags=["training-data", "react-three-fiber", "static-index"],
    ) as run:
        table = wandb.Table(
            columns=["path", "root", "kind", "rows_or_lines", "bytes", "summary"],
            data=compact_file_rows(data),
        )
        run.log({**metrics, "inventory/table": table})

        artifact = wandb.Artifact(
            name=args.artifact_name,
            type="dataset",
            description="Nemo Clawd generated training-data index and local training-data files.",
            metadata=artifact_metadata(data),
        )
        artifact.add_file(str(site_data_path), name="site-data.json")
        for file_path in training_files:
            artifact.add_file(str(file_path), name=str(file_path.relative_to(workspace)))
        run.log_artifact(artifact, aliases=[args.alias])
        run.summary.update(metrics)
        print(f"Logged W&B run: {run.url}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
