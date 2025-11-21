/**
 * Job-Specific Analytics - Progress, Productivity, Team metrics for individual jobs
 */

import { Job } from '../../core/types.js';
import { calculateJobAnalytics, createProgressBar } from '../../shared/analytics-utils.js';

export function generateJobProgressAnalytics(job: Job): string {
  const analytics = calculateJobAnalytics(job);

  return `Job #${job.id} Progress Analytics

${job.title}

Completion Status
Progress: ${analytics.completedTasks}/${analytics.totalTasks} tasks complete (${analytics.completionRate}%)
Active Tasks: ${analytics.activeTasks}
Blocked Tasks: ${analytics.blockedTasks}
Pending Tasks: ${analytics.pendingTasks}

Progress Visualization
${createProgressBar(analytics.completionRate)}

Task Status Breakdown
${job.tasks.map(task => `${task.id}: ${task.title} [${task.status}]`).join('\n')}`;
}

export function generateJobProductivityAnalytics(job: Job): string {
  const analytics = calculateJobAnalytics(job);

  return `Job #${job.id} Productivity Metrics

${job.title}

Timeline
Created: ${new Date(job.created).toLocaleDateString()}
Last Updated: ${new Date(job.lastUpdated).toLocaleDateString()}
Age: ${analytics.jobAgeDays} day${analytics.jobAgeDays !== 1 ? 's' : ''} old
Tasks/Day: ${analytics.totalTasks} total, avg ${(analytics.totalTasks / Math.max(analytics.jobAgeDays, 1)).toFixed(1)} tasks/day
Completion/Day: ${analytics.completedTasks} completed, avg ${(analytics.completedTasks / Math.max(analytics.jobAgeDays, 1)).toFixed(1)} completions/day

Team Productivity
${analytics.teamProgress}

Efficiency Score
${analytics.completionRate >= 80 ? 'Excellent' : analytics.completionRate >= 60 ? 'Good' : analytics.completionRate >= 40 ? 'Average' : 'Needs Attention'} - ${analytics.completionRate}% completion rate`;
}

export function generateJobTeamAnalytics(job: Job): string {
  const analytics = calculateJobAnalytics(job);

  return `Job #${job.id} Team Analytics

${job.title}

Team Distribution
${Object.entries(analytics.teamStats).map(([team, count]) => {
  const completed = job.tasks.filter(t => t.team === team && t.status === 'completed').length;
  const rate = count > 0 ? Math.round((completed / count) * 100) : 0;
  return `${team}: ${completed}/${count} tasks complete (${rate}%)`;
}).join('\n')}

Active Work by Team
${job.tasks.filter(t => t.status === 'active').map(task =>
  `${task.title} (${task.team})`
).join('\n') || 'No active tasks'}

Team Leaderboard
${Object.entries(analytics.teamStats)
  .sort(([,a], [,b]) => b - a)
  .map(([team, count], index) => `${index + 1}. ${team}: ${count} tasks`)
  .join('\n')}`;
}

export function generateJobCompleteAnalytics(job: Job): string {
  const analytics = calculateJobAnalytics(job);

  return `Job #${job.id} Complete Analytics

${job.title}
Domain: ${job.domain}

Overall Progress
Total Tasks: ${analytics.totalTasks}
Completed: ${analytics.completedTasks} (${analytics.completionRate}%)
Active: ${analytics.activeTasks}
Blocked: ${analytics.blockedTasks}
Pending: ${analytics.pendingTasks}

Team Breakdown
${analytics.teamProgress}

Timeline
Created: ${new Date(job.created).toLocaleDateString()}
Last Activity: ${new Date(job.lastUpdated).toLocaleDateString()}
Age: ${analytics.jobAgeDays} day${analytics.jobAgeDays !== 1 ? 's' : ''} old

Key Metrics
Completion Rate: ${analytics.completionRate}%
Active Workload: ${analytics.activeTasks} tasks
Team Involvement: ${Object.keys(analytics.teamStats).length} team${Object.keys(analytics.teamStats).length !== 1 ? 's' : ''}

Progress Bar
${createProgressBar(analytics.completionRate)} Complete

Recent Activity
${job.tasks.filter(t => t.status === 'completed').slice(-3).map(task =>
  `${task.title} (${task.team})`
).join('\n') || 'No recent completions'}`;
}
