import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DOCS_ROOT } from '../core/config.js';
import { loadCONDUCKS, saveCONDUCKS, getNextJobId } from '../core/storage.js';
import { Job, CONDUCKSStorage } from '../core/types.js';

interface CreateJobArgs {
  name: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
  estimated_effort?: string;
  objectives?: string[];
  dependencies?: string[];
  should_split?: boolean; // Agent suggests this should be multiple jobs
}

interface CreateJobResult {
  success: boolean;
  jobs: Array<{
    id: number;
    name: string;
    filePath: string;
  }>;
  message: string;
}

/**
 * Slugify job name for filename
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

/**
 * Detect if job should be split based on complexity signals
 */
function detectJobSplitOpportunity(args: CreateJobArgs): boolean {
  // If agent explicitly suggests splitting
  if (args.should_split) {
    return true;
  }
  
  // If objectives suggest multiple independent work streams
  if (args.objectives && args.objectives.length > 5) {
    const keywords = ['and', 'also', 'plus', 'additionally', 'separate', 'independent'];
    const hasMultipleStreams = args.objectives.some(obj => 
      keywords.some(kw => obj.toLowerCase().includes(kw))
    );
    if (hasMultipleStreams) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate job markdown file content
 */
function generateJobMarkdown(job: Job, args: CreateJobArgs): string {
  const now = new Date().toISOString().split('T')[0];
  
  let content = `# Job ${String(job.id).padStart(3, '0')}: ${job.title}\n\n`;
  content += `Status: active\n`;
  content += `Created: ${now}\n`;
  content += `Priority: ${args.priority || 'medium'}\n`;
  
  if (args.estimated_effort) {
    content += `Estimated Effort: ${args.estimated_effort}\n`;
  }
  
  content += `\nDESCRIPTION\n\n${args.description}\n\n`;
  
  if (args.objectives && args.objectives.length > 0) {
    content += `OBJECTIVES\n\n`;
    args.objectives.forEach((obj, idx) => {
      content += `${idx + 1}. ${obj}\n`;
    });
    content += `\n`;
  }
  
  content += `LINKED TASKS\n\n`;
  content += `(Tasks will be added here as they are created via process_docs)\n\n`;
  
  if (args.dependencies && args.dependencies.length > 0) {
    content += `DEPENDENCIES\n\n`;
    args.dependencies.forEach(dep => {
      content += `${dep}\n`;
    });
    content += `\n`;
  } else {
    content += `DEPENDENCIES\n\nNone\n\n`;
  }
  
  content += `NOTES\n\n`;
  content += `This job file is the source of truth for high-level coordination.\n`;
  content += `Detailed tasks live in project/subproject/domain.md files.\n`;
  
  return content;
}

/**
 * Creates job file and updates jobs.toon
 */
export async function handleCreateJob(args: CreateJobArgs): Promise<CreateJobResult> {
  try {
    // Ensure jobs/to-do directory exists
    const toDoDir = join(DOCS_ROOT, 'jobs', 'to-do');
    if (!existsSync(toDoDir)) {
      mkdirSync(toDoDir, { recursive: true });
    }
    
    // Load existing jobs
    const storage = await loadCONDUCKS();
    const createdJobs: Array<{ id: number; name: string; filePath: string }> = [];
    
    // Check if we should split into multiple jobs
    const shouldSplit = detectJobSplitOpportunity(args);
    
    if (shouldSplit && args.objectives && args.objectives.length > 3) {
      // Split into multiple jobs based on objectives
      const jobsToCreate = Math.min(args.objectives.length, 5); // Cap at 5 jobs max
      
      for (let i = 0; i < jobsToCreate; i++) {
        const jobId = await getNextJobId();
        const jobName = args.objectives[i] || `${args.name} - Part ${i + 1}`;
        const slug = slugify(jobName);
        const fileName = `${String(jobId).padStart(3, '0')}_${slug}.md`;
        const filePath = join(toDoDir, fileName);
        
        const job: Job = {
          id: jobId,
          title: jobName,
          domain: args.dependencies && args.dependencies.length > 0 ? args.dependencies[0] : 'general',
          description: i === 0 ? args.description : `Part of larger initiative: ${args.name}`,
          tasks: [],
          crossServiceLinks: args.dependencies || [],
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        
        storage.jobs.push(job);
        
        // Create job file
        const markdown = generateJobMarkdown(job, {
          ...args,
          name: jobName,
          objectives: [args.objectives[i]]
        });
        writeFileSync(filePath, markdown, 'utf-8');
        
        createdJobs.push({
          id: jobId,
          name: jobName,
          filePath: `jobs/to-do/${fileName}`
        });
      }
      
      await saveCONDUCKS(storage);
      
      return {
        success: true,
        jobs: createdJobs,
        message: `Split into ${createdJobs.length} independent jobs for parallel execution. Each job can be worked on separately.`
      };
      
    } else {
      // Create single job
      const jobId = await getNextJobId();
      const slug = slugify(args.name);
      const fileName = `${String(jobId).padStart(3, '0')}_${slug}.md`;
      const filePath = join(toDoDir, fileName);
      
      const job: Job = {
        id: jobId,
        title: args.name,
        domain: args.dependencies && args.dependencies.length > 0 ? args.dependencies[0] : 'general',
        description: args.description,
        tasks: [],
        crossServiceLinks: args.dependencies || [],
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      storage.jobs.push(job);
      await saveCONDUCKS(storage);
      
      // Create job file
      const markdown = generateJobMarkdown(job, args);
      writeFileSync(filePath, markdown, 'utf-8');
      
      return {
        success: true,
        jobs: [{
          id: jobId,
          name: args.name,
          filePath: `jobs/to-do/${fileName}`
        }],
        message: `Created single job. Use process_docs to add tasks to this job.`
      };
    }
    
  } catch (error) {
    return {
      success: false,
      jobs: [],
      message: `Failed to create job: ${error}`
    };
  }
}

/**
 * Format result for MCP response (plain text)
 */
export function formatCreateJobResult(result: CreateJobResult): string {
  if (!result.success) {
    return `JOB CREATION FAILED\n\n${result.message}`;
  }
  
  let output = `JOB(S) CREATED\n\n`;
  
  for (const job of result.jobs) {
    output += `Job ${String(job.id).padStart(3, '0')}: ${job.name}\n`;
    output += `File: ${join(DOCS_ROOT, job.filePath)}\n\n`;
  }
  
  output += `${result.message}\n\n`;
  output += `Next steps:\n`;
  output += `1. Use initialize_project_structure to set up project folders (if not done)\n`;
  output += `2. Use process_docs to create tasks and organize into domain files\n`;
  output += `3. Use smart_info to check job status and task organization\n`;
  
  return output;
}
