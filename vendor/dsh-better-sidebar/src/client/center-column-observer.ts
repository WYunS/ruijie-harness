const CENTER_NODE_SELECTOR = '[data-slot="conversation"], [data-pane="conversation"]'

function containsCenterNode(node: Node): boolean {
  if (node.nodeType !== 1) return false
  const element = node as Element
  return element.matches(CENTER_NODE_SELECTOR) || element.querySelector(CENTER_NODE_SELECTOR) !== null
}

/**
 * Watch the application root for nested conversation-layout replacement and
 * ask the sidebar to relocate its center-column anchor. Streaming output also
 * mutates deep inside this root, so only mutations which add/remove one of the
 * stable conversation markers trigger the relatively expensive measurement.
 */
export function observeCenterColumnChanges(root: HTMLElement, locate: () => void): () => void {
  const watcher = new MutationObserver((records) => {
    const layoutChanged = records.some(record =>
      [...record.addedNodes, ...record.removedNodes].some(containsCenterNode),
    )
    if (layoutChanged) locate()
  })
  watcher.observe(root, { childList: true, subtree: true })
  return () => { watcher.disconnect() }
}
