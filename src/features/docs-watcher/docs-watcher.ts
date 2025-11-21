// CONDUCKS Documentation Watcher & Real-time Updates
// Handles file system watching, gap detection, and automated documentation updates

import fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { ArchitectJob, ArchitectTask, CONDUCKSStorage } from '../../core/types.js';
import { DOCS_ROOT } from '../../core/config.js';
import { loadCONDUCKS } from '../../core/storage.js';

// Documentation structure - Updated for service-oriented layout
export interface DocumentationStructure {
  analysis: string[];      // Global analysis files
  debug: string[];         // Debug files (per-service structure)
  'problem-solution': string[];  // Global problem-solution files
  info: string[];          // Info files (global)
  research: string[];      // Research files (global)
  'to-do': string[];       // Global active tasks
  'done-to-do': string[];  // Global completed tasks
}

// Service-specific documentation structure
export interface ServiceDocumentation {
  [serviceName: string]: ServiceDocs;
}

export interface ServiceDocs {
  analysis: string[];
  'problem-solution': string[];
  'to-do': string[];
  'done-to-do': string[];
}

// File watcher configuration
export interface FileWatcherConfig {
  watchInterval: number;        // Check for changes every N ms
  debounceDelay: number;        // Debounce file change events
  autoCreateDirectories: boolean; // Auto-create directory structure
  enableNotifications: boolean;  // Send MCP resource notifications
  gapDetectionEnabled: boolean;  // Check for missing documentation
}

export class DocumentationWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private documentationStructure: DocumentationStructure = {
    analysis: [],
    debug: [],
    'problem-solution': [],
    info: [],
    research: [],
    'to-do': [],
    'done-to-do': []
  };

  private config: FileWatcherConfig;
  private isWatching: boolean = false;
  private pendingUpdates: Map<string, number> = new Map(); // Debouncing
  private changeCallbacks: Array<(event: string, path: string, stats?: fs.Stats) => void> = [];

  constructor(config: Partial<FileWatcherConfig> = {}) {
    this.config = {
      watchInterval: config.watchInterval ?? 5000,
      debounceDelay: config.debounceDelay ?? 1000,
      autoCreateDirectories: config.autoCreateDirectories ?? true,
      enableNotifications: config.enableNotifications ?? true,
      gapDetectionEnabled: config.gapDetectionEnabled ?? true
    };
  }

  /**
   * Start watching documentation directories
   */
  async startWatching(): Promise<void> {
    if (this.isWatching) return;

    console.log('Starting documentation watcher...');

    // Ensure documentation structure exists
    await this.ensureDocumentationStructure();

    // Set up file system watcher
    this.watcher = chokidar.watch([
      path.join(DOCS_ROOT, '**/*.md')
    ], {
      ignored: /(^|[\/\\])\../, // Ignore hidden files
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // Bind event handlers
    this.watcher.on('add', this.handleFileAdded.bind(this));
    this.watcher.on('change', this.handleFileChanged.bind(this));
    this.watcher.on('unlink', this.handleFileRemoved.bind(this));
    this.watcher.on('addDir', this.handleDirectoryAdded.bind(this));
    this.watcher.on('unlinkDir', this.handleDirectoryRemoved.bind(this));

    this.isWatching = true;

    // Start periodic gap detection
    if (this.config.gapDetectionEnabled) {
      setInterval(this.performGapDetection.bind(this), this.config.watchInterval);
    }

    console.log('Documentation watcher started successfully');
  }

  /**
   * Stop watching
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching) return;

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    console.log('Documentation watcher stopped');
  }

  /**
   * Register callback for documentation changes
   */
  onDocumentationChange(callback: (event: string, path: string, stats?: fs.Stats) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Ensure documentation directory structure exists
   */
  async ensureDocumentationStructure(): Promise<void> {
    const docsDir = path.join(DOCS_ROOT, 'docs');

    for (const category of Object.keys(this.documentationStructure)) {
      const categoryPath = path.join(docsDir, 'CONDUCKS', category);
      await fs.ensureDir(categoryPath);
    }

    // Initialize file tracking
    await this.scanExistingFiles();

    console.log('Documentation structure verified');
  }

  /**
   * Scan and index existing documentation files
   */
  private async scanExistingFiles(): Promise<void> {
    const docsDir = path.join(DOCS_ROOT, 'docs', 'CONDUCKS');

    try {
      const exists = await fs.pathExists(docsDir);
      if (!exists) return;

      for (const category of Object.keys(this.documentationStructure)) {
        const categoryPath = path.join(docsDir, category);
        const files = await fs.readdir(categoryPath).catch(() => []);

        this.documentationStructure[category as keyof DocumentationStructure] = files
          .filter(file => file.endsWith('.md'))
          .sort();
      }
    } catch (error) {
      console.error('Error scanning existing files:', error);
    }
  }

  /**
   * Handle file addition
   */
  private handleFileAdded(filePath: string, stats?: fs.Stats): void {
    this.debouncedUpdate('add', filePath, stats);
  }

  /**
   * Handle file changes
   */
  private handleFileChanged(filePath: string, stats?: fs.Stats): void {
    this.debouncedUpdate('change', filePath, stats);
  }

  /**
   * Handle file removal
   */
  private handleFileRemoved(filePath: string): void {
    this.debouncedUpdate('unlink', filePath);
  }

  /**
   * Handle directory addition
   */
  private handleDirectoryAdded(dirPath: string): void {
    console.log(`New documentation directory: ${dirPath}`);
  }

  /**
   * Handle directory removal
   */
  private handleDirectoryRemoved(dirPath: string): void {
    console.log(`Documentation directory removed: ${dirPath}`);
  }

  /**
   * Debounced update processing
   */
  private debouncedUpdate(event: string, filePath: string, stats?: fs.Stats): void {
    // Check if documentation file
    if (!filePath.includes('/docs/CONDUCKS/') || !filePath.endsWith('.md')) {
      return;
    }

    // Clear existing timeout for this file
    const existingTimeout = this.pendingUpdates.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new debounced timeout
    const timeoutId = setTimeout(() => {
      this.processDocumentationUpdate(event, filePath, stats);
      this.pendingUpdates.delete(filePath);
    }, this.config.debounceDelay);

    this.pendingUpdates.set(filePath, timeoutId as any);
  }

  /**
   * Process documentation updates
   */
  private async processDocumentationUpdate(event: string, filePath: string, stats?: fs.Stats): Promise<void> {
    try {
      // Extract category and filename
      const match = filePath.match(/\/docs\/CONDUCKS\/([^\/]+)\/(.+\.md)$/);
      if (!match) return;

      const category = match[1] as keyof DocumentationStructure;
      const filename = match[2];

      // Update internal tracking
      await this.updateFileTracking(event, category, filename);

      // Validate file structure
      const validation = await this.validateDocumentationFile(filePath, category);
      if (!validation.valid) {
        console.warn(`Invalid documentation file ${filename}:`, validation.issues);
      }

      // Check for gaps that need filling
      if (this.config.gapDetectionEnabled) {
        await this.checkDocumentationGaps(filePath, category);
      }

      // Notify MCP subscribers
      if (this.config.enableNotifications) {
        this.notifyDocumentationChange(event, filePath, stats);
      }

      // Trigger callbacks
      for (const callback of this.changeCallbacks) {
        try {
          callback(event, filePath, stats);
        } catch (error) {
          console.error('Error in documentation change callback:', error);
        }
      }

    } catch (error) {
      console.error(`Error processing documentation update for ${filePath}:`, error);
    }
  }

  /**
   * Update internal file tracking
   */
  private async updateFileTracking(event: string, category: keyof DocumentationStructure, filename: string): Promise<void> {
    const fileList = this.documentationStructure[category];

    switch (event) {
      case 'add':
        if (!fileList.includes(filename)) {
          fileList.push(filename);
          fileList.sort();
        }
        break;
      case 'unlink':
        const index = fileList.indexOf(filename);
        if (index > -1) {
          fileList.splice(index, 1);
        }
        break;
      case 'change':
        // File content changed, but filename stays the same
        break;
    }
  }

  /**
   * Validate documentation file structure and content
   */
  private async validateDocumentationFile(filePath: string, category: keyof DocumentationStructure): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check filename format
      const expectedPattern = /^\d{3}_.+\.md$/;
      if (!expectedPattern.test(path.basename(filePath))) {
        issues.push('Filename should follow XXX_description.md pattern');
      }

      // Category-specific validations
      switch (category) {
        case 'analysis':
          if (!content.includes('# ') && !content.includes('## ')) {
            issues.push('Analysis files should have proper headings');
          }
          if (!content.toLowerCase().includes('risk') || !content.toLowerCase().includes('approach')) {
            issues.push('Analysis files should discuss risks and approaches');
          }
          break;

        case 'to-do':
          if (!content.includes('## Requirements') && !content.includes('## Implementation')) {
            issues.push('To-do files should have requirements and implementation sections');
          }
          break;

        case 'problem-solution':
          if (!content.toLowerCase().includes('solution') || !content.toLowerCase().includes('root cause')) {
            issues.push('Problem-solution files should document root cause and solution');
          }
          break;
      }

    } catch (error) {
      issues.push(`Unable to read file: ${error}`);
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Check for documentation gaps that need filling
   */
  private async checkDocumentationGaps(filePath: string, category: keyof DocumentationStructure): Promise<void> {
    const storage = await loadCONDUCKS();

    // Get the job/task reference from the file content
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const references = this.extractJobTaskReferences(content);

      for (const ref of references) {
        const gaps = await this.identifyMissingDocumentation(storage, ref.jobId, ref.taskId, category);
        if (gaps.length > 0) {
          console.log(`📋 GAPS DETECTED for Job ${ref.jobId}, Task ${ref.taskId}:`, gaps);
          // In production, this would trigger gap-filling suggestions
        }
      }
    } catch (error) {
      // Silently handle read errors during gap detection
    }
  }

  /**
   * Extract job/task references from documentation content
   */
  private extractJobTaskReferences(content: string): Array<{ jobId: number; taskId?: string }> {
    const references: Array<{ jobId: number; taskId?: string }> = [];

    // Look for CONDUCKS formatting: CONDUCKS.1.2 or CONDUCKS.1
    const refPattern = /CONDUCKS\.(\d+)(?:\.(\w+))?/g;
    let match;

    while ((match = refPattern.exec(content)) !== null) {
      references.push({
        jobId: parseInt(match[1]),
        taskId: match[2]
      });
    }

    return references;
  }

  /**
   * Identify missing documentation for a job/task
   */
  private async identifyMissingDocumentation(storage: CONDUCKSStorage, jobId: number, taskId: string | undefined, category: keyof DocumentationStructure): Promise<string[]> {
    const gaps: string[] = [];
    const job = storage.jobs.find(j => j.id === jobId);
    if (!job) return gaps;

    if (taskId) {
      const task = job.tasks.find(t => t.id === taskId);
      if (!task) return gaps;

      switch (category) {
        case 'debug':
          if (task.status === 'blocked' && !this.hasRelatedDebugFile(jobId, taskId)) {
            gaps.push('Debug documentation for blocked task');
          }
          break;

        case 'analysis':
          if (task.priority === 'critical' && !this.hasRelatedAnalysisFile(jobId, taskId)) {
            gaps.push('Risk analysis for critical task');
          }
          break;
      }
    } else {
      // Job-level gaps
      if (job.tasks.length > 3 && !this.hasJobAnalysisFile(jobId)) {
        gaps.push('Comprehensive job analysis documentation');
      }
    }

    return gaps;
  }

  /**
   * Perform periodic gap detection across all jobs
   */
  private async performGapDetection(): Promise<void> {
    try {
      const storage = await loadCONDUCKS();

      for (const job of storage.jobs) {
        // Check for missing analysis files for high-complexity jobs
        if (this.shouldHaveAnalysis(job) && !this.hasJobAnalysisFile(job.id)) {
          console.log(`📋 GAP: Job ${job.id} needs analysis documentation`);
        }

        // Check tasks for documentation requirements
        for (const task of job.tasks) {
          const taskGaps = await this.identifyMissingDocumentation(storage, job.id, task.id, 'debug');
          if (taskGaps.length > 0) {
            console.log(`📋 GAP: Task ${task.id} in Job ${job.id} needs documentation`);
          }
        }
      }
    } catch (error) {
      console.error('Error during periodic gap detection:', error);
    }
  }

  /**
   * Determine if a job should have analysis documentation
   */
  private shouldHaveAnalysis(job: ArchitectJob): boolean {
    // Complex jobs need analysis
    const taskCount = job.tasks?.length || 0;
    const hasRiskAssessment = !!job.risk_assessment && job.risk_assessment.trim() !== '';
    const isArchitectural = job.domain.includes('architectural') || job.domain.includes('system');

    return taskCount > 5 || isArchitectural || hasRiskAssessment;
  }

  // Helper methods for existence checks
  private hasRelatedDebugFile(jobId: number, taskId: string): boolean {
    const debugFiles = this.documentationStructure.debug;
    return debugFiles.some(file =>
      file.includes(`job${jobId}`) || file.includes(`task${taskId}`)
    );
  }

  private hasRelatedAnalysisFile(jobId: number, taskId: string): boolean {
    const analysisFiles = this.documentationStructure.analysis;
    return analysisFiles.some(file =>
      file.includes(`job${jobId}`) || file.includes(`task${taskId}`)
    );
  }

  private hasJobAnalysisFile(jobId: number): boolean {
    const analysisFiles = this.documentationStructure.analysis;
    return analysisFiles.some(file => file.includes(`job${jobId}`));
  }

  /**
   * Notify MCP about documentation changes
   */
  private notifyDocumentationChange(event: string, filePath: string, stats?: fs.Stats): void {
    // In production, this would send MCP resource update notifications
    console.log(`📄 Documentation ${event}: ${path.relative(DOCS_ROOT, filePath)}`);

    // Example MCP notification structure (would be sent to MCP clients):
    /*
    const notification = {
      method: 'resources/updated',
      params: {
        uri: `file://${filePath}`,
        metadata: {
          lastModified: stats?.mtime,
          category: this.getFileCategory(filePath),
          type: 'documentation'
        }
      }
    };
    */
  }

  /**
   * Get category from file path
   */
  private getFileCategory(filePath: string): string {
    const match = filePath.match(/\/docs\/CONDUCKS\/([^\/]+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Get current documentation structure snapshot
   */
  getDocumentationStructure(): DocumentationStructure {
    return { ...this.documentationStructure };
  }

  /**
   * Generate documentation completeness report
   */
  async generateCompletenessReport(): Promise<{
    totalFiles: number;
    categoryBreakdown: Record<string, number>;
    gapsIdentified: string[];
    recommendations: string[];
  }> {
    const report: {
      totalFiles: number;
      categoryBreakdown: Record<string, number>;
      gapsIdentified: string[];
      recommendations: string[];
    } = {
      totalFiles: 0,
      categoryBreakdown: {},
      gapsIdentified: [],
      recommendations: []
    };

    // Count files in each category
    for (const [category, files] of Object.entries(this.documentationStructure)) {
      report.categoryBreakdown[category as string] = files.length;
      report.totalFiles += files.length;
    }

    // Perform comprehensive gap analysis
    const storage = await loadCONDUCKS();

    for (const job of storage.jobs) {
      // Check job-level gaps
      if (this.shouldHaveAnalysis(job) && !this.hasJobAnalysisFile(job.id)) {
        report.gapsIdentified.push(`Job ${job.id}: Missing analysis documentation`);
        report.recommendations.push(`Create analysis.XXX_job${job.id}_overview.md`);
      }

      // Check task-level gaps
      for (const task of job.tasks) {
        if (task.status === 'blocked' && !this.hasRelatedDebugFile(job.id, task.id)) {
          report.gapsIdentified.push(`Task ${task.id} (Job ${job.id}): Missing debug documentation for blocked task`);
          report.recommendations.push(`Create debug.XXX_task${task.id}_investigation.md`);
        }
      }
    }

    return report;
  }
}

// Export singleton instance
export const documentationWatcher = new DocumentationWatcher();

// Convenience functions
export async function startDocumentationWatching(): Promise<void> {
  await documentationWatcher.startWatching();
}

export async function stopDocumentationWatching(): Promise<void> {
  await documentationWatcher.stopWatching();
}

export function getCurrentDocumentationStructure(): DocumentationStructure {
  return documentationWatcher.getDocumentationStructure();
}
