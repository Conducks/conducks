# Conducks Skill: Architecture Exploration (Structural Orientation)

Use this skill to quickly understand an unfamiliar codebase by orienting your structural search around the Conducks Gospel Core.

## 1. Initial Structural Context
Call `conducks_system(mode: 'architecture-context')` to get a summary of the project's health, stats, and entry points.

## 2. Identify System Entry Points
Browse `resource://conducks/entry-points` to find where the main execution flows begin.
Focus on functions or routes that have high PageRank gravity.

## 3. Map Core Relationships
Call `conducks_trace(mode: 'execution', symbol: <entry_point_id>)` to understand the primary execution paths.
Use `conducks_query` with broad terms like "database," "auth," or "engine" to find central hubs.

## 4. Final Orientation Report
Summarize the architectural layers (e.g., Domain, Interface, Core) and identify the 3 most structurally significant symbols.
Highlight any major violations found with `conducks_governance(mode: 'audit')`.
