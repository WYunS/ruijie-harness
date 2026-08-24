/** Model-facing policy for recoverable search failures in the desktop product. */
export const SEARCH_RECOVERY_PROMPT = `## 搜索失败恢复

搜索或网页读取工具失败通常是可恢复的中间状态，不代表用户任务已经失败。
- 不要用相同参数重复调用同一个失败的搜索工具。
- 立即切换到不同的可用搜索或浏览工具；若仍不可用，改用已取得的信息继续推理。
- 只要存在安全可行的替代路径，就继续推进并完成用户任务。
- 只有所有合理替代路径都已失败、确实无法完成时，才在最终答复中简洁说明限制。`
