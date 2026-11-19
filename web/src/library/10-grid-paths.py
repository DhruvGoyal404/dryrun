# title: Paths through a grid with walls
# pattern: 2D DP
# call: grid_paths([[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [1, 0, 0, 0]])
# expect: grid
# dryrun: grid dp
# Each open cell is reached from above or from the left.
def grid_paths(walls):
    rows, cols = len(walls), len(walls[0])
    dp = [[0] * cols for _ in range(rows)]
    dp[0][0] = 1
    for r in range(rows):
        for c in range(cols):
            if walls[r][c]:
                dp[r][c] = 0
            elif r or c:
                up = dp[r - 1][c] if r else 0
                left = dp[r][c - 1] if c else 0
                dp[r][c] = up + left
    return dp[rows - 1][cols - 1]
