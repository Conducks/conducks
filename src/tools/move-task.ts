import { existsSync, renameSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { DOCS_ROOT } from '../core/config.js';

interface MoveTaskArgs {
  project: string;
  subproject: string;
  domain_file: string; // e.g., "poi-discovery.md"
  direction: 'to_done' | 'to_todo';
}

interface MoveTaskResult {
  success: boolean;
  message: string;
  newPath?: string;
}

/**
 * Inline rules (shown in every response)
 */
function getInlineRules(): string {
  return `\nRULES: Group by 2+ criteria (journey/complexity/team/frequency) | Split at: 50 tasks OR 20k chars`;
}

/**
 * Move domain file between to-do and done-to-do
 */
export async function handleMoveTask(args: MoveTaskArgs): Promise<MoveTaskResult> {
  try {
    const { project, subproject, domain_file, direction } = args;
    
    const subprojectPath = join(DOCS_ROOT, project, subproject);
    
    if (!existsSync(subprojectPath)) {
      return {
        success: false,
        message: `Subproject path not found: ${project}/${subproject}`
      };
    }
    
    const sourcePath = direction === 'to_done' 
      ? join(subprojectPath, 'to-do', domain_file)
      : join(subprojectPath, 'done-to-do', domain_file);
    
    const destDir = direction === 'to_done'
      ? join(subprojectPath, 'done-to-do')
      : join(subprojectPath, 'to-do');
    
    const destPath = join(destDir, domain_file);
    
    if (!existsSync(sourcePath)) {
      // Check if file is in subproject root (flexible placement)
      const rootPath = join(subprojectPath, domain_file);
      if (existsSync(rootPath)) {
        // Move from root to destination
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        renameSync(rootPath, destPath);
        
        const action = direction === 'to_done' ? 'ARCHIVED' : 'REACTIVATED';
        return {
          success: true,
          message: `${action} ${domain_file}${getInlineRules()}`,
          newPath: `${project}/${subproject}/${direction === 'to_done' ? 'done-to-do' : 'to-do'}/${domain_file}`
        };
      }
      
      return {
        success: false,
        message: `File not found: ${domain_file}`
      };
    }
    
    // Ensure destination directory exists
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    
    // Move file
    renameSync(sourcePath, destPath);
    
    const action = direction === 'to_done' ? 'ARCHIVED' : 'REACTIVATED';
    return {
      success: true,
      message: `${action} ${domain_file}${getInlineRules()}`,
      newPath: `${project}/${subproject}/${direction === 'to_done' ? 'done-to-do' : 'to-do'}/${domain_file}`
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Move failed: ${error}`
    };
  }
}

/**
 * Format result (TOON style)
 */
export function formatMoveTaskResult(result: MoveTaskResult): string {
  if (!result.success) {
    return `MOVE FAILED | ${result.message}`;
  }
  
  return `${result.message}\nNew location: ${result.newPath}`;
}
