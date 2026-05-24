"""Convert a blueprint JSON to src/data/maze-blueprint.ts."""

import json
import sys


def export_blueprint(blueprint_path: str, output_path: str) -> None:
    with open(blueprint_path) as f:
        data = json.load(f)

    rounds = data["rounds"]
    removals = data.get("removals")

    lines = [
        "export const MAZE_BLUEPRINT: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = ["
    ]
    for round_positions in rounds:
        entries = ", ".join(f"[{x}, {y}]" for x, y in round_positions)
        lines.append(f"  [{entries}],")
    lines.append("];\n")

    if removals:
        lines.append(
            "export const MAZE_REMOVALS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = ["
        )
        for round_removals in removals:
            if round_removals:
                entries = ", ".join(f"[{x}, {y}]" for x, y in round_removals)
                lines.append(f"  [{entries}],")
            else:
                lines.append("  [],")
        lines.append("];\n")
    else:
        lines.append(
            "export const MAZE_REMOVALS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = ["
        )
        for _ in rounds:
            lines.append("  [],")
        lines.append("];\n")

    with open(output_path, "w") as f:
        f.write("\n".join(lines))

    n_removals = sum(len(r) for r in removals) if removals else 0
    print(f"Exported {len(rounds)} rounds ({n_removals} removals) to {output_path}")


if __name__ == "__main__":
    bp_path = sys.argv[1] if len(sys.argv) > 1 else "blueprint_reworked.json"
    out_path = (
        sys.argv[2]
        if len(sys.argv) > 2
        else "../../src/data/maze-blueprint.ts"
    )
    export_blueprint(bp_path, out_path)
