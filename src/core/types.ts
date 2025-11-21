// CONDUCKS Core Types
// All TypeScript type definitions for the CONDUCKS system

export type TaskStatus = 'active' | 'completed' | 'pending' | 'blocked' | 'needs_review';

// Basic interface for current implementation
export interface SubTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: 'high' | 'medium' | 'low' | 'critical';
  complexity: 'simple' | 'medium' | 'complex';
  team: string;
  service: string;
  description: string;
  dependencies: string[];
  notes?: string;
  lastUpdated?: string;
}

export interface Job {
  id: number;
  title: string;
  domain: string;
  description: string;
  tasks: SubTask[];
  crossServiceLinks: string[];
  created: string;
  lastUpdated: string;
}

export interface CONDUCKSStorage {
  jobs: Job[];
  crossReferences: { [key: string]: string[] };
}

// Future Architect Mode Types
export type ArchitectJobStatus =
  | 'proposed'          // Agent proposed, needs review
  | 'human_feedback'    // User provided feedback, revise
  | 'confirmed'         // User approved, ready for implementation
  | 'in_progress'       // Tasks being worked on
  | 'on_hold'          // Blocked or paused
  | 'completed'        // All tasks done
  | 'cancelled';       // User cancelled

export type ArchitectTaskStatus =
  | 'dependent'         // Waiting on other tasks
  | 'proposed'          // Agent suggested
  | 'confirmed'         // User approved
  | 'in_progress'       // Active development
  | 'code_review'       // Needs human review
  | 'qa_testing'        // Quality assurance
  | 'completed'         // Done and merged
  | 'blocked'          // External dependencies
  | 'needs_help';       // Agent stuck, needs human intervention

// Enhanced Job interface for Architect Mode
export interface ArchitectJob extends Job {
  vision?: string;                    // Long-term architectural goals
  risk_assessment?: string;           // Technical risks identified
  estimated_time?: string;            // Weeks/months estimation
  dependencies?: string[];            // Pre-requisite jobs
  tags?: string[];                    // Category tags
  architect_notes?: string;           // Agent analysis and human feedback
}

// Enhanced Task interface for Architect Mode
export interface ArchitectTask extends SubTask {
  implementation_notes?: string;      // Agent technical recommendations
  human_feedback?: string;            // User's specific requirements
  dependency_type?: 'parallel' | 'dependent' | 'blocking';
  time_estimate?: string;             // hours/days
  files_created?: string[];           // Linked analysis/solution files
}

// MCP-specific types
export interface MCPServerConfig {
  version: string;
  capabilities: {
    tools: Record<string, unknown>;
    resources: Record<string, unknown>;
  };
}
