# title: In-order walk of a search tree
# pattern: Tree traversal
# call: in_order(insert_all([8, 4, 12, 2, 6, 10, 14]))
# expect: tree
# Left subtree, the node, right subtree: a search tree comes out sorted.
class TreeNode:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, val):
    if root is None:
        return TreeNode(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

def insert_all(values):
    root = None
    for v in values:
        root = insert(root, v)
    return root

def in_order(node, out=None):
    out = [] if out is None else out
    if node:
        in_order(node.left, out)
        out.append(node.val)
        in_order(node.right, out)
    return out
