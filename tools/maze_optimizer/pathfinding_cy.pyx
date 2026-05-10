# cython: boundscheck=False, wraparound=False, cdivision=True
"""Cython A* pathfinding — drop-in replacement for pathfinding.py."""

import numpy as np
cimport numpy as np
from libc.stdlib cimport malloc, free

DEF GRID_W = 42
DEF GRID_H = 42
DEF GRID_SIZE = GRID_W * GRID_H
DEF CELL_WALL = 2
DEF CELL_TOWER = 3
DEF CELL_ROCK = 4

cdef struct HeapEntry:
    int f
    int counter
    int idx

cdef inline int _manhattan(int ax, int ay, int bx, int by) noexcept nogil:
    cdef int dx = ax - bx
    cdef int dy = ay - by
    if dx < 0:
        dx = -dx
    if dy < 0:
        dy = -dy
    return dx + dy

cdef inline void _heap_push(HeapEntry* heap, int* size, int f, int counter, int idx) noexcept nogil:
    cdef int i = size[0]
    cdef int parent
    size[0] = i + 1
    heap[i].f = f
    heap[i].counter = counter
    heap[i].idx = idx
    while i > 0:
        parent = (i - 1) >> 1
        if heap[parent].f > heap[i].f or (heap[parent].f == heap[i].f and heap[parent].counter > heap[i].counter):
            heap[i], heap[parent] = heap[parent], heap[i]
            i = parent
        else:
            break

cdef inline HeapEntry _heap_pop(HeapEntry* heap, int* size) noexcept nogil:
    cdef HeapEntry top = heap[0]
    cdef int n = size[0] - 1
    size[0] = n
    if n > 0:
        heap[0] = heap[n]
        _sift_down(heap, n, 0)
    return top

cdef inline void _sift_down(HeapEntry* heap, int n, int i) noexcept nogil:
    cdef int child, right
    while True:
        child = 2 * i + 1
        if child >= n:
            break
        right = child + 1
        if right < n and (heap[right].f < heap[child].f or (heap[right].f == heap[child].f and heap[right].counter < heap[child].counter)):
            child = right
        if heap[child].f < heap[i].f or (heap[child].f == heap[i].f and heap[child].counter < heap[i].counter):
            heap[i], heap[child] = heap[child], heap[i]
            i = child
        else:
            break


def a_star(tuple start, tuple goal, np.int8_t[:, ::1] grid, extra_set=None):
    cdef int sx = start[0], sy = start[1]
    cdef int gx = goal[0], gy = goal[1]

    if sx == gx and sy == gy:
        return [(sx, sy)]

    cdef int goal_idx = gy * GRID_W + gx
    cdef int start_idx = sy * GRID_W + sx

    cdef int* g_score = <int*>malloc(GRID_SIZE * sizeof(int))
    cdef int* came_from = <int*>malloc(GRID_SIZE * sizeof(int))
    cdef HeapEntry* heap = <HeapEntry*>malloc(GRID_SIZE * sizeof(HeapEntry))

    if g_score == NULL or came_from == NULL or heap == NULL:
        if g_score != NULL: free(g_score)
        if came_from != NULL: free(came_from)
        if heap != NULL: free(heap)
        raise MemoryError()

    cdef int i
    for i in range(GRID_SIZE):
        g_score[i] = -1
        came_from[i] = -1

    # Build extra blocked array
    cdef bint* extra_blocked = NULL
    if extra_set is not None and len(extra_set) > 0:
        extra_blocked = <bint*>malloc(GRID_SIZE * sizeof(bint))
        for i in range(GRID_SIZE):
            extra_blocked[i] = 0
        for ex, ey in extra_set:
            if 0 <= ex < GRID_W and 0 <= ey < GRID_H:
                extra_blocked[ey * GRID_W + ex] = 1

    g_score[start_idx] = 0
    cdef int heap_size = 0
    cdef int counter = 0
    _heap_push(heap, &heap_size, _manhattan(sx, sy, gx, gy), counter, start_idx)

    cdef HeapEntry entry
    cdef int cx, cy, cg, nx, ny, n_idx, tentative
    cdef int dx, dy
    cdef int[4] dir_dx
    cdef int[4] dir_dy
    dir_dx[0] = 1; dir_dx[1] = -1; dir_dx[2] = 0; dir_dx[3] = 0
    dir_dy[0] = 0; dir_dy[1] = 0; dir_dy[2] = 1; dir_dy[3] = -1
    cdef int d
    cdef int cell_val
    cdef list result = None

    while heap_size > 0:
        entry = _heap_pop(heap, &heap_size)
        if entry.idx == goal_idx:
            result = _reconstruct_c(came_from, entry.idx)
            break

        cx = entry.idx % GRID_W
        cy = entry.idx // GRID_W
        cg = g_score[entry.idx]
        if cg < 0 or entry.f - _manhattan(cx, cy, gx, gy) > cg:
            continue

        for d in range(4):
            nx = cx + dir_dx[d]
            ny = cy + dir_dy[d]
            if nx < 0 or ny < 0 or nx >= GRID_W or ny >= GRID_H:
                continue
            n_idx = ny * GRID_W + nx
            if extra_blocked != NULL and extra_blocked[n_idx]:
                continue
            cell_val = grid[ny, nx]
            if cell_val == CELL_WALL or cell_val == CELL_TOWER or cell_val == CELL_ROCK:
                continue
            tentative = cg + 1
            if g_score[n_idx] >= 0 and tentative >= g_score[n_idx]:
                continue
            came_from[n_idx] = entry.idx
            g_score[n_idx] = tentative
            counter += 1
            _heap_push(heap, &heap_size, tentative + _manhattan(nx, ny, gx, gy), counter, n_idx)

    free(g_score)
    free(came_from)
    free(heap)
    if extra_blocked != NULL:
        free(extra_blocked)
    return result


cdef list _reconstruct_c(int* came_from, int end_idx):
    cdef list path = []
    cdef int curr = end_idx
    while curr >= 0:
        path.append((curr % GRID_W, curr // GRID_W))
        curr = came_from[curr]
    path.reverse()
    return path


WAYPOINTS = [
    (0, 6), (8, 6), (8, 22), (32, 22),
    (32, 6), (20, 6), (20, 34), (40, 34),
]

FOOTPRINT = ((0, 0), (1, 0), (0, 1), (1, 1))


def find_route(np.int8_t[:, ::1] grid, extra=None, waypoints=None):
    if waypoints is None:
        waypoints = WAYPOINTS
    cdef list segments = []
    for i in range(len(waypoints) - 1):
        a = waypoints[i]
        b = waypoints[i + 1]
        seg = a_star((a[0], a[1]), (b[0], b[1]), grid, extra)
        if seg is None:
            return None
        segments.append(seg)
    return segments


def flatten_route(list segments):
    cdef list out = []
    cdef int i
    for i in range(len(segments)):
        if i == 0:
            out.extend(segments[i])
        else:
            out.extend(segments[i][1:])
    return out


def footprint_cells(int x, int y):
    return {(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)}
