# title: Friend circles with union-find
# pattern: Union-find
# call: circles(7, [(0, 1), (2, 3), (1, 4), (5, 6), (3, 5)])
# expect: array
# dryrun: array parent
# Each set is a tree in parent[]; find follows it to the root and
# shortens the path behind it.
def circles(n, pairs):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    groups = n
    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            groups -= 1
    return groups
