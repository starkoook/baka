"""Small JSON-lines bridge from Electron to a selected lora-rescripts repository."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


def _load_services(repo_root: Path):
    sys.path.insert(0, str(repo_root))
    os.chdir(repo_root)

    from launcher.core.compatibility import build_runtime_compatibility_matrix
    from launcher.core.runtime_catalog import build_runtime_catalog
    from launcher.core.runtime_coordinator import RuntimeCoordinator
    from launcher.core.runtime_initializer import initialize_runtime_environment

    return (
        build_runtime_catalog,
        build_runtime_compatibility_matrix,
        RuntimeCoordinator,
        initialize_runtime_environment,
    )


def _dispatch(repo_root: Path, method: str, params: dict[str, Any]) -> Any:
    build_catalog, build_compatibility, coordinator_type, initialize_runtime = _load_services(repo_root)
    settings = dict(params.get("settings") or {})
    coordinator = coordinator_type(repo_root=repo_root, settings_provider=lambda: settings)

    if method == "get_runtime_defs":
        return build_catalog(repo_root)
    if method == "get_runtimes":
        return coordinator.get_serialized_statuses()
    if method == "get_best_runtime":
        return coordinator.get_best_runtime_id()
    if method == "get_runtime_recommendation":
        return coordinator.get_runtime_recommendation()
    if method == "get_runtime_compatibility":
        return build_compatibility()
    if method == "get_launch_preflight":
        return coordinator.get_launch_preflight(params.get("runtime_id"), settings)
    if method == "get_install_plan":
        prepared = coordinator.prepare_install(
            params.get("runtime_id"),
            cn_mirror=bool(settings.get("cn_mirror", False)),
        )
        return prepared.build_plan().to_public_dict() if prepared else None
    if method == "initialize_runtime":
        prepared = coordinator.prepare_install(
            params.get("runtime_id"),
            cn_mirror=bool(settings.get("cn_mirror", False)),
        )
        if prepared is None:
            raise ValueError("未知的运行环境")
        log_lines: list[str] = []
        result = initialize_runtime(
            prepared.runtime_def,
            repo_root=repo_root,
            statuses=prepared.statuses,
            cn_mirror=prepared.cn_mirror,
            log_callback=log_lines.append,
        )
        coordinator.invalidate_status_cache()
        return {
            "runtime_id": result.runtime_id,
            "target_dir": str(result.target_dir),
            "python_path": str(result.python_path),
            "source_runtime_id": result.source_runtime_id,
            "log_lines": log_lines,
        }
    if method == "get_health_report":
        return coordinator.get_health_report(selected_runtime_id=params.get("runtime_id"))
    raise ValueError(f"Unsupported bridge method: {method}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()
    repo_root = Path(args.repo).resolve()

    for raw_line in sys.stdin:
        if not raw_line.strip():
            continue
        request: dict[str, Any] = {}
        try:
            request = json.loads(raw_line)
            result = _dispatch(
                repo_root,
                str(request.get("method") or ""),
                dict(request.get("params") or {}),
            )
            response = {"id": request.get("id"), "ok": True, "result": result}
        except Exception as exc:
            response = {
                "id": request.get("id"),
                "ok": False,
                "error": str(exc),
                "error_type": type(exc).__name__,
            }
        print(json.dumps(response, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
