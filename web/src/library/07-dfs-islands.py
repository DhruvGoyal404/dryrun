# title: Count the islands on a map
# pattern: DFS
# call: count_islands([[1, 1, 0, 0], [0, 1, 0, 1], [1, 0, 0, 1], [1, 0, 1, 1]])
# expect: grid
# Each land cell not yet visited starts a depth-first flood that sinks its island.
def count_islands(grid):
    rows, cols = len(grid), len(grid[0])

    def sink(r, c):
        if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] == 0:
            return
        grid[r][c] = 0
        sink(r + 1, c)
        sink(r - 1, c)
        sink(r, c + 1)
        sink(r, c - 1)

    islands = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                islands += 1
                sink(r, c)
    return islands
