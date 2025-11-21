/**
 * Shared Analytics Utility Functions
 * Token-efficient calculations for job and system analytics
 */

import { Job, TaskStatus } from '../core/types.js';

export interface JobAnalytics {
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  pendingTasks: number;
  completionRate: number;
  teamStats: Record<string, number>;
  teamProgress: string;
  jobAgeDays: number;
}

export interface SystemAnalytics {
  totalJobs: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  completedJobs: number;
  overallCompletionRate: number;
  domainStats: Record<string, number>;
  teamStats: Record<string, number>;
}

export function calculateJobAnalytics(job: Job): JobAnalytics {
  const totalTasks = job.tasks.length;
  const completedTasks = job.tasks.filter(t => t.status === 'completed').length;
  const activeTasks = job.tasks.filter(t => t.status === 'active').length;
  const blockedTasks = job.tasks.filter(t => t.status === 'blocked').length;
  const pendingTasks = job.tasks.filter(t => t.status === 'pending').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const teamStats = job.tasks.reduce((acc, task) => {
    acc[task.team] = (acc[task.team] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const teamProgress = Object.entries(teamStats).map(([team, total]) => {
    const completed = job.tasks.filter(t => t.team === team && t.status === 'completed').length;
    return `${team}: ${completed}/${total} completed`;
  }).join(', ');

  const createdDate = new Date(job.created);
  const now = new Date();
  const jobAgeDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    totalTasks,
    completedTasks,
    activeTasks,
    blockedTasks,
    pendingTasks,
    completionRate,
    teamStats,
    teamProgress,
    jobAgeDays
  };
}

export function calculateSystemAnalytics(jobs: Job[]): SystemAnalytics {
  const totalJobs = jobs.length;
  const totalTasks = jobs.reduce((acc, job) => acc + job.tasks.length, 0);
  const activeTasks = jobs.reduce((acc, job) =>
    acc + job.tasks.filter(task => task.status === 'active').length, 0);
  const completedTasks = jobs.reduce((acc, job) =>
    acc + job.tasks.filter(task => task.status === 'completed').length, 0);
  const completedJobs = jobs.filter(job =>
    job.tasks.every(task => task.status === 'completed')).length;

  const overallCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const domainStats = jobs.reduce((acc, job) => {
    acc[job.domain] = (acc[job.domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const teamStats = jobs.flatMap(job => job.tasks).reduce((acc, task) => {
    acc[task.team] = (acc[task.team] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalJobs,
    totalTasks,
    activeTasks,
    completedTasks,
    completedJobs,
    overallCompletionRate,
    domainStats,
    teamStats
  };
}

export function createProgressBar(completionRate: number): string {
  return '█'.repeat(Math.floor(completionRate / 10)) + '░'.repeat(10 - Math.floor(completionRate / 10)) + ` ${completionRate}%`;
}
