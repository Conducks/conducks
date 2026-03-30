import { execSync } from 'node:child_process';
import { ConducksAdjacencyList, NodeId } from '@/lib/core/graph/adjacency-list.js';
import path from 'node:path';

/**
 * Conducks — Co-Change Engine
 * 
 * Analyzes temporal coupling via Git history to find "Architectural Lies".
 * Leveraging DuckDB's vectorized engine for high-performance matrix calculation.
 */
export class CoChangeEngine {
  constructor(
    private readonly projectDir: string = process.cwd(),
    private readonly historyExtractor?: () => string
  ) {}

  /**
   * Identifies file pairs with high temporal coupling but no structural link.
   */
  public async discoverHiddenCoupling(graph: ConducksAdjacencyList, db: any): Promise<Array<{ fileA: string, fileB: string, confidence: number }>> {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error('[Conducks Co-Change] Extraction in progress...');
    }
    
    // 1. Get entire Git history in a machine-readable format
    // Format: <hash> <file>
    let output = '';
    if (this.historyExtractor) {
      output = this.historyExtractor();
    } else {
      const command = `git log --pretty=format:"COMMIT:%H" --name-only`;
      output = execSync(command, { cwd: this.projectDir, encoding: 'utf-8' });
    }
    
    const lines = output.split('\n');
    const commitData: Array<{ hash: string, filePath: string }> = [];
    let currentHash = '';
    
    for (const line of lines) {
      if (line.startsWith('COMMIT:')) {
        currentHash = line.replace('COMMIT:', '');
      } else if (line.trim().length > 0) {
        commitData.push({ hash: currentHash, filePath: path.resolve(this.projectDir, line.trim()) });
      }
    }

    // 2. Vectorized Analysis via DuckDB
    // We create a temporary table for this pulse's co-change analysis
    return new Promise((resolve, reject) => {
      db.exec("CREATE TEMPORARY TABLE IF NOT EXISTS commit_history (hash VARCHAR, filePath VARCHAR)", (err: any) => {
        if (err) return reject(err);
        
        // Batch insert (Simplified for this version)
        const stmt = db.prepare("INSERT INTO commit_history VALUES (?, ?)");
        for (const data of commitData) {
          stmt.run(data.hash, data.filePath);
        }
        stmt.finalize();

        // 3. Matrix Multi: Find Co-Occurrence
        const sql = `
          SELECT a.filePath as fA, b.filePath as fB, count(*) as count
          FROM commit_history a
          JOIN commit_history b ON a.hash = b.hash
          WHERE a.filePath < b.filePath
          GROUP BY a.filePath, b.filePath
          HAVING count > 3
          ORDER BY count DESC
          LIMIT 100
        `;

        db.all(sql, (err: any, rows: any[]) => {
          if (err) return reject(err);
          
          const hiddenCoupling = [];
          for (const row of rows) {
            // Check if there is a structural edge in the graph
            const hasEdge = (graph as any).getNeighborsByFilePath(row.fA, 'downstream').some((n: any) => n.targetPath === row.fB) ||
                            (graph as any).getNeighborsByFilePath(row.fB, 'downstream').some((n: any) => n.targetPath === row.fA);

            if (!hasEdge) {
              hiddenCoupling.push({
                fileA: row.fA,
                fileB: row.fB,
                confidence: Math.min(Number(row.count) / 10, 1.0) // Simple confidence heuristic
              });
            }
          }
          resolve(hiddenCoupling);
        });
      });
    });
  }
}
