/**
 * System-Wide Analytics - Global metrics across all jobs
 */

import { Job } from '../../core/types.js';
import { calculateSystemAnalytics, createProgressBar } from '../../shared/analytics-utils.js';

export function generateSystemProgressAnalytics(jobs: Job[]): string {
  const analytics = calculateSystemAnalytics(jobs);

  return `System Progress Analytics

Global Metrics
Total Jobs: ${analytics.totalJobs}
Total Tasks: ${analytics.totalTasks}
Completed Jobs: ${analytics.completedJobs}
Active Tasks: ${analytics.activeTasks}
Overall Completion: ${analytics.completedTasks}/${analytics.totalTasks} (${analytics.overallCompletionRate}%)

Job Completion Status
${jobs.map(job => {
  const completed = job.tasks.filter(t => t.status === 'completed').length;
  const total = job.tasks.length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status = completed === total ? 'DONE' : completed > 0 ? 'IN_PROGRESS' : 'PENDING';
  return `${status} Job #${job.id}: ${rate}% complete`;
}).join('\n')}`;
}

export function generateSystemProductivityAnalytics(jobs: Job[]): string {
  const analytics = calculateSystemAnalytics(jobs);

  return `System Productivity Analytics

Overall Performance
Jobs Completed: ${analytics.completedJobs}/${analytics.totalJobs} (${Math.round((analytics.completedJobs / analytics.totalJobs) * 100)}%)
Task Completion Rate: ${analytics.overallCompletionRate}%
Active Workload: ${analytics.activeTasks} tasks in progress
Average Team Size: ${(Object.values(analytics.teamStats).reduce((a,b) => a+b, 0) / analytics.totalJobs).toFixed(1)} tasks/job

Top Performing Domains
${Object.entries(analytics.domainStats)
  .sort(([,a], [,b]) => b - a)
  .map(([domain, count]) => {
    const completedInDomain = jobs
      .filter(job => job.domain === domain)
      .reduce((acc, job) => acc + job.tasks.filter(t => t.status === 'completed').length, 0);
    const totalInDomain = jobs
      .filter(job => job.domain === domain)
      .reduce((acc, job) => acc + job.tasks.length, 0);
    const rate = totalInDomain > 0 ? Math.round((completedInDomain / totalInDomain) * 100) : 0;
    return `${domain}: ${rate}% (${count} jobs)`;
  }).join('\n')}`;
}

export function generateSystemTeamAnalytics(jobs: Job[]): string {
  const analytics = calculateSystemAnalytics(jobs);

  return `System Team Analytics

Team Workload Distribution
${Object.entries(analytics.teamStats).map(([team, totalTasks]) => {
  const completedTasks = jobs
    .flatMap(job => job.tasks)
    .filter(task => task.team === team && task.status === 'completed').length;
  const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  return `${team}: ${completedTasks}/${totalTasks} tasks complete (${rate}%)`;
}).join('\n')}

Team Productivity Rankings
${Object.entries(analytics.teamStats)
  .sort(([,a], [,b]) => b - a)
  .map(([team, total], index) => {
    const active = jobs
      .flatMap(job => job.tasks)
      .filter(task => task.team === team && task.status === 'active').length;
    return `${index + 1}. ${team}: ${total} total, ${active} active`;
  }).join('\n')}

Team Focus Areas
${Object.entries(analytics.teamStats).map(([team]) => {
  const teamTasks = jobs
    .flatMap(job => job.tasks)
    .filter(task => task.team === team)
    .slice(0, 3);
  return `${team} (${teamTasks.length} tasks):\n${teamTasks.map(task =>
    `${task.title} [${task.status}]`).join('\n')}`;
}).join('\n\n')}`;
}

export function generateSystemCompleteAnalytics(jobs: Job[]): string {
  const analytics = calculateSystemAnalytics(jobs);

  return `CONDUCKS System Analytics

System Overview
Total Jobs: ${analytics.totalJobs}
Total Tasks: ${analytics.totalTasks}
Completed Tasks: ${analytics.completedTasks}
Active Tasks: ${analytics.activeTasks}
Completion Rate: ${analytics.overallCompletionRate}%

Key Performance Indicators
Job Completion Rate: ${analytics.completedJobs}/${analytics.totalJobs} (${Math.round((analytics.completedJobs / analytics.totalJobs) * 100)}%)
Active Workload: ${analytics.activeTasks} tasks currently in progress
Domains Covered: ${Object.keys(analytics.domainStats).length} technical domains
Teams Involved: ${Object.keys(analytics.teamStats).length} teams

Domain Performance
${Object.entries(analytics.domainStats).map(([domain, count]) => {
  const completedInDomain = jobs
    .filter(job => job.domain === domain)
    .reduce((acc, job) => acc + job.tasks.filter(t => t.status === 'completed').length, 0);
  const totalInDomain = jobs
    .filter(job => job.domain === domain)
    .reduce((acc, job) => acc + job.tasks.length, 0);
  const rate = totalInDomain > 0 ? Math.round((completedInDomain / totalInDomain) * 100) : 0;
  return `${domain}: ${rate}% completion (${count} jobs)`;
}).join('\n')}

Team Distribution
${Object.entries(analytics.teamStats).map(([team, totalTasks]) => {
  const completedTasks = jobs
    .flatMap(job => job.tasks)
    .filter(task => task.team === team && task.status === 'completed').length;
  const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  return `${team}: ${completedTasks}/${totalTasks} tasks (${rate}%)`;
}).join('\n')}

Progress Visualization
${createProgressBar(analytics.overallCompletionRate)} Overall Completion

Quick Actions
Run list_jobs() to see all current jobs
Use get_job_tasks({ job_id: X }) to drill down into specific jobs
Use smart_info({ context: 'system' }) for system overview`;
}
