from enum import IntEnum
from typing import NamedTuple

import numpy as np

GRID_W = 42
GRID_H = 42

# Valid placement range for 2x2 footprint (stays inside wall border)
PLACE_MIN = 2
PLACE_MAX_X = GRID_W - 4  # 38 inclusive
PLACE_MAX_Y = GRID_H - 4  # 38 inclusive


class Cell(IntEnum):
    Grass = 0
    Path = 1
    Wall = 2
    Tower = 3
    Rock = 4
    Trap = 5


class Waypoint(NamedTuple):
    x: int
    y: int


WAYPOINTS = [
    Waypoint(0, 6),
    Waypoint(8, 6),
    Waypoint(8, 22),
    Waypoint(32, 22),
    Waypoint(32, 6),
    Waypoint(20, 6),
    Waypoint(20, 34),
    Waypoint(40, 34),
]

START = WAYPOINTS[0]
END = WAYPOINTS[-1]

FOOTPRINT = ((0, 0), (1, 0), (0, 1), (1, 1))

CHECKPOINT_ZONES: list[list[tuple[int, int]]] = [
    [(7, 6), (8, 6), (9, 6), (8, 7)],
    [(8, 21), (8, 22), (8, 23), (9, 22)],
    [(31, 22), (32, 22), (32, 23), (32, 21)],
    [(32, 7), (32, 6), (32, 5), (31, 6)],
    [(21, 6), (20, 6), (19, 6), (20, 7)],
    [(20, 33), (20, 34), (19, 34), (21, 34)],
]


def build_base_layout() -> np.ndarray:
    grid = np.full((GRID_H, GRID_W), Cell.Grass, dtype=np.int8)

    # 2-cell-thick wall border
    grid[:2, :] = Cell.Wall
    grid[-2:, :] = Cell.Wall
    grid[:, :2] = Cell.Wall
    grid[:, -2:] = Cell.Wall

    # Start: 2×2 path + 1 blocker (matches game map.ts)
    grid[START.y:START.y + 2, 0:2] = Cell.Path
    grid[START.y, 2] = Cell.Path

    # End: 2×2 path + 1 blocker (matches game map.ts)
    grid[END.y:END.y + 2, GRID_W - 2:GRID_W] = Cell.Path
    grid[END.y, GRID_W - 3] = Cell.Path

    # Checkpoint zones around waypoints 1-6
    for zone in CHECKPOINT_ZONES:
        for x, y in zone:
            grid[y, x] = Cell.Path

    return grid


BASE_GRID = build_base_layout()


def copy_grid(grid: np.ndarray) -> np.ndarray:
    return grid.copy()


def in_bounds(x: int, y: int) -> bool:
    return 0 <= x < GRID_W and 0 <= y < GRID_H


def is_buildable(cell: int) -> bool:
    return cell == Cell.Grass


def can_place_2x2(grid: np.ndarray, x: int, y: int) -> bool:
    if x < PLACE_MIN or x > PLACE_MAX_X or y < PLACE_MIN or y > PLACE_MAX_Y:
        return False
    return bool((grid[y:y + 2, x:x + 2] == Cell.Grass).all())


def is_adjacent_to_maze(grid: np.ndarray, ax: int, ay: int) -> bool:
    for dx in range(-1, 3):
        for dy in range(-1, 3):
            if 0 <= dx <= 1 and 0 <= dy <= 1:
                continue
            nx = ax + dx
            ny = ay + dy
            if nx < 0 or ny < 0 or nx >= GRID_W or ny >= GRID_H:
                continue
            cell = grid[ny, nx]
            if cell == Cell.Tower or cell == Cell.Rock or cell == Cell.Path:
                return True
    return False


def place_tower(grid: np.ndarray, x: int, y: int, cell_type: int = Cell.Tower) -> None:
    grid[y:y + 2, x:x + 2] = cell_type


def place_trap(grid: np.ndarray, x: int, y: int) -> None:
    """Place a trap (walkable, non-buildable) at a 2x2 footprint."""
    grid[y:y + 2, x:x + 2] = Cell.Trap


def can_place_trap_2x2(grid: np.ndarray, x: int, y: int) -> bool:
    """Check if a trap can be placed — requires Grass or Path cells (traps are walkable)."""
    if x < PLACE_MIN or x > PLACE_MAX_X or y < PLACE_MIN or y > PLACE_MAX_Y:
        return False
    block = grid[y:y + 2, x:x + 2]
    return bool(((block == Cell.Grass) | (block == Cell.Path)).all())
