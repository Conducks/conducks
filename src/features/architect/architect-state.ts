// CONDUCKS Architect State Management
// Handles confirmation workflows, pending approvals, and state transitions

import fs from 'fs-extra';
import * as path from 'path';
import { ArchitectJob, ArchitectJobStatus, CONDUCKSStorage } from '../../core/types.js';
import { DOCS_ROOT } from '../../core/config.js';

// Workflow state storage extension
export interface ArchitectStorage extends CONDUCKSStorage {
  architectStates: ArchitectWorkflowState[];
  pendingConfirmations: PendingConfirmation[];
  humanFeedback: HumanFeedback[];
}

export interface ArchitectWorkflowState {
  id: string;                    // Unique workflow ID
  jobId: number;                 // Associated job ID
  status: ArchitectJobStatus;    // Current workflow status
  currentStep: string;           // Current workflow step
  stepHistory: WorkflowStep[];   // History of all steps
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;            // Auto-expire pending states
}

export interface WorkflowStep {
  stepId: string;
  name: string;
  performedAt: string;
  actor: 'agent' | 'human';
  action: string;
  data?: any;                    // Additional step data
  notes?: string;
}

export interface PendingConfirmation {
  id: string;
  jobId: number;
  workflowId: string;
  proposal: ArchitectJob;
  questions: ArchitectQuestion[];
  responses: Record<string, any>;
  proposedAt: string;
  expiresAt: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
}

export interface ArchitectQuestion {
  id: string;
  question: string;
  category: string;
  options?: string[];
  required: boolean;
  priority: number;
  answered?: boolean;
  answer?: any;
}

export interface HumanFeedback {
  id: string;
  sessionId: string;             // Links to workflow session
  jobId: number;
  questionId: string;
  feedback: any;
  providedAt: string;
  feedbackType: 'response' | 'confirmation' | 'rejection' | 'modification';
}

// Constants
const ARCHITECT_STATE_FILE = path.join(DOCS_ROOT, 'architect-states.toon');
// Note: Confirmations stay cancelled, never auto-expire
// const CONFIRMATION_TIMEOUT_HOURS = 24;
// const CLEANUP_INTERVAL_HOURS = 6;

// State management functions
export class ArchitectStateManager {
  private architectStorage: ArchitectStorage | null = null;

  /**
   * Load architect state data
   */
  async loadArchitectState(): Promise<ArchitectStorage> {
    if (!this.architectStorage) {
      try {
        await fs.ensureDir(DOCS_ROOT);

        if (await fs.pathExists(ARCHITECT_STATE_FILE)) {
          const fileContent = await fs.readFile(ARCHITECT_STATE_FILE, 'utf-8');
          // In real implementation, this would be TOON decoding
          this.architectStorage = JSON.parse(fileContent);
        } else {
          // Initialize empty state
          this.architectStorage = {
            jobs: [],
            crossReferences: {},
            architectStates: [],
            pendingConfirmations: [],
            humanFeedback: []
          };
        }
      } catch (error) {
        // Fallback to empty state
        this.architectStorage = {
          jobs: [],
          crossReferences: {},
          architectStates: [],
          pendingConfirmations: [],
          humanFeedback: []
        };
      }
    }

    // Ensure we never return null
    if (!this.architectStorage) {
      this.architectStorage = {
        jobs: [],
        crossReferences: {},
        architectStates: [],
        pendingConfirmations: [],
        humanFeedback: []
      };
    }

    return this.architectStorage;
  }

  /**
   * Save architect state to disk
   */
  async saveArchitectState(): Promise<void> {
    if (!this.architectStorage) return;

    try {
      await fs.ensureDir(DOCS_ROOT);
      // In real implementation, this would be TOON encoding
      await fs.writeFile(ARCHITECT_STATE_FILE, JSON.stringify(this.architectStorage, null, 2));
    } catch (error) {
      console.error('Failed to save architect state:', error);
      throw error;
    }
  }

  /**
   * Create new architect workflow
   */
  async createArchitectWorkflow(jobId: number, proposal: ArchitectJob, questions: ArchitectQuestion[]): Promise<string> {
    const storage = await this.loadArchitectState();
    const workflowId = `workflow_${Date.now()}_${jobId}`;

    // Create workflow state
    const workflowState: ArchitectWorkflowState = {
      id: workflowId,
      jobId,
      status: 'proposed',
      currentStep: 'proposal_generated',
      stepHistory: [{
        stepId: 'initial_proposal',
        name: 'Proposal Generated',
        performedAt: new Date().toISOString(),
        actor: 'agent',
        action: 'generated_initial_proposal',
        data: {
          questionsCount: questions.length,
          complexity: proposal.architect_notes ? JSON.parse(proposal.architect_notes).complexity_score : 5
        }
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
      // No expiration for architect workflows
    };

    // Create pending confirmation
    const pendingConfirmation: PendingConfirmation = {
      id: `confirmation_${workflowId}`,
      jobId,
      workflowId,
      proposal,
      questions,
      responses: {},
      proposedAt: new Date().toISOString(),
      expiresAt: 'never', // No expiration
      status: 'pending'
    };

    storage.architectStates.push(workflowState);
    storage.pendingConfirmations.push(pendingConfirmation);

    await this.saveArchitectState();

    return workflowId;
  }

  /**
   * Submit human response to architect question
   */
  async submitHumanResponse(workflowId: string, questionId: string, response: any, feedbackType: 'response' | 'confirmation' | 'rejection' | 'modification' = 'response'): Promise<{ success: boolean; message: string; nextAction?: string }> {
    const storage = await this.loadArchitectState();

    // Find the workflow
    const workflow = storage.architectStates.find(w => w.id === workflowId);
    if (!workflow) {
      return { success: false, message: 'Workflow not found' };
    }

    // Find the pending confirmation
    const confirmation = storage.pendingConfirmations.find(c => c.workflowId === workflowId);
    if (!confirmation) {
      return { success: false, message: 'Pending confirmation not found' };
    }

    // Record human feedback
    const humanFeedback: HumanFeedback = {
      id: `feedback_${Date.now()}`,
      sessionId: workflowId,
      jobId: workflow.jobId,
      questionId,
      feedback: response,
      providedAt: new Date().toISOString(),
      feedbackType
    };

    storage.humanFeedback.push(humanFeedback);

    // Update response in confirmation
    confirmation.responses[questionId] = response;

    // Record step in workflow history
    workflow.stepHistory.push({
      stepId: `human_response_${questionId}`,
      name: `Human Response to ${questionId}`,
      performedAt: new Date().toISOString(),
      actor: 'human',
      action: feedbackType,
      data: response,
      notes: `Human provided ${feedbackType}`
    });

    // Handle different feedback types
    if (feedbackType === 'confirmation') {
      return await this.confirmProposal(workflowId, confirmation, workflow);
    } else if (feedbackType === 'rejection') {
      return await this.rejectProposal(workflowId, workflow, response);
    } else if (feedbackType === 'modification') {
      return await this.modifyProposal(workflowId, confirmation, workflow, response);
    } else {
      // Regular response - check if all questions answered
      const allRequiredAnswered = confirmation.questions
        .filter(q => q.required)
        .every(q => q.id in confirmation.responses);

      if (allRequiredAnswered) {
        workflow.currentStep = 'all_questions_answered';
        confirmation.proposal.architect_notes = JSON.stringify({
          ...JSON.parse(confirmation.proposal.architect_notes || '{}'),
          human_feedback_received: new Date().toISOString()
        });
      } else {
        workflow.currentStep = 'awaiting_responses';
      }
    }

    workflow.updatedAt = new Date().toISOString();
    await this.saveArchitectState();

    return {
      success: true,
      message: 'Response recorded successfully',
      nextAction: workflow.currentStep === 'all_questions_answered' ? 'can_proceed_to_confirmation' : 'continue_questions'
    };
  }

  /**
   * Confirm proposal and transition to implementation
   */
  private async confirmProposal(workflowId: string, confirmation: PendingConfirmation, workflow: ArchitectWorkflowState): Promise<{ success: boolean; message: string; nextAction?: string }> {
    // Mark as confirmed
    confirmation.status = 'confirmed';
    workflow.status = 'confirmed';
    workflow.currentStep = 'confirmed_ready_for_implementation';

    // Add confirmation step to history
    workflow.stepHistory.push({
      stepId: 'final_confirmation',
      name: 'Proposal Confirmed',
      performedAt: new Date().toISOString(),
      actor: 'human',
      action: 'confirmed_proposal',
      notes: 'Human has confirmed the architect proposal'
    });

    workflow.updatedAt = new Date().toISOString();

    await this.saveArchitectState();

    return {
      success: true,
      message: 'Proposal confirmed! Ready for implementation.',
      nextAction: 'create_job_and_tasks'
    };
  }

  /**
   * Handle proposal rejection
   */
  private async rejectProposal(workflowId: string, workflow: ArchitectWorkflowState, reason: any): Promise<{ success: boolean; message: string }> {
    workflow.status = 'cancelled';
    workflow.currentStep = 'rejected_by_human';

    workflow.stepHistory.push({
      stepId: 'proposal_rejected',
      name: 'Proposal Rejected',
      performedAt: new Date().toISOString(),
      actor: 'human',
      action: 'rejected_proposal',
      data: reason,
      notes: 'Proposal was rejected by human'
    });

    workflow.updatedAt = new Date().toISOString();

    await this.saveArchitectState();

    return {
      success: true,
      message: 'Proposal rejected. Would you like to modify and resubmit, or cancel entirely?'
    };
  }

  /**
   * Handle proposal modification
   */
  private async modifyProposal(workflowId: string, confirmation: PendingConfirmation, workflow: ArchitectWorkflowState, modifications: any): Promise<{ success: boolean; message: string }> {
    workflow.status = 'human_feedback';
    workflow.currentStep = 'proposal_modified_awaiting_revision';

    workflow.stepHistory.push({
      stepId: 'proposal_modified',
      name: 'Proposal Modified',
      performedAt: new Date().toISOString(),
      actor: 'human',
      action: 'modified_proposal',
      data: modifications,
      notes: 'Human requested modifications to the proposal'
    });

    workflow.updatedAt = new Date().toISOString();

    // Reset confirmation status to allow revisions
    confirmation.status = 'pending';
    confirmation.responses = {}; // Clear responses to restart workflow

    await this.saveArchitectState();

    return {
      success: true,
      message: 'Modifications recorded. Agent will revise the proposal.'
    };
  }

  /**
   * Get current workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<ArchitectWorkflowState | null> {
    const storage = await this.loadArchitectState();
    return storage.architectStates.find(w => w.id === workflowId) || null;
  }

  /**
   * Get pending confirmations for a user
   */
  async getPendingConfirmations(jobId?: number): Promise<PendingConfirmation[]> {
    const storage = await this.loadArchitectState();
    const pending = storage.pendingConfirmations.filter(c => c.status === 'pending');

    if (jobId !== undefined) {
      return pending.filter(c => c.jobId === jobId);
    }

    return pending;
  }

  // No cleanup methods needed since confirmations don't expire
}

// Export singleton instance
export const architectStateManager = new ArchitectStateManager();

// Convenience functions
export async function getArchitectWorkflow(workflowId: string): Promise<ArchitectWorkflowState | null> {
  return await architectStateManager.getWorkflowStatus(workflowId);
}

export async function getPendingArchitectConfirmations(jobId?: number): Promise<PendingConfirmation[]> {
  return await architectStateManager.getPendingConfirmations(jobId);
}
