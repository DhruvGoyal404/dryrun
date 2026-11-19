# title: A tree, level by level
# pattern: Queue / BFS
# call: levels(make_tree())
# expect: tree
# A queue hands out nodes in the order they were found: one level at a time.
from collections import deque

class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def make_tree():
    return TreeNode(1, TreeNode(2, TreeNode(4), TreeNode(5)), TreeNode(3, None, TreeNode(6)))

def levels(root):
    out = []
    queue = deque([root])
    while queue:
        row = []
        for _ in range(len(queue)):
            node = queue.popleft()
            row.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        out.append(row)
    return out
