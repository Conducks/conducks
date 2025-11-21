// CONDUCKS Business Logic
// Task analysis, categorization, and processing functions

import { SubTask } from './types.js';
import { DOMAIN_MAPPINGS, TEAM_ASSIGNMENTS, PRIORITY_RULES } from './config.js';

// Task analysis functions
export function task_keywords_to_domain(keywords: string): string {
  const log = (message: string) => console.error(`[${new Date().toISOString()}] CONDUCKS: ${message}`);
  log(`Analyzing keywords: "${keywords}"`);

  const lowerKeywords = keywords.toLowerCase();

  for (const [key, domain] of Object.entries(DOMAIN_MAPPINGS)) {
    if (lowerKeywords.includes(key)) {
      return domain;
    }
  }

  return 'general-development';
}

export function task_keywords_to_title(keywords: string): string {
  return keywords.split(' ').slice(0, 3).join(' ').toUpperCase() + '...';
}

export function generate_subtasks(taskDescription: string, services: string[]): SubTask[] {
  const log = (message: string) => console.error(`[${new Date().toISOString()}] CONDUCKS: ${message}`);
  log(`Generating subtasks for ${services.length} services`);
  const subtasks: SubTask[] = [];
  let counter = 1;

  services.forEach((service, index) => {
    const isCritical = Object.keys(PRIORITY_RULES.critical).includes(service);
    const complexity = isCritical ? 'complex' : (index === 0 ? 'medium' : 'simple');

    subtasks.push({
      id: `task_${counter++}`,
      title: `${service.charAt(0).toUpperCase() + service.slice(1)} Integration`,
      status: 'pending',
      priority: isCritical ? 'critical' : 'high',
      complexity: complexity as 'simple' | 'medium' | 'complex',
      team: TEAM_ASSIGNMENTS[service as keyof typeof TEAM_ASSIGNMENTS] || TEAM_ASSIGNMENTS.default,
      service: service,
      description: `Implement ${taskDescription} for ${service} service`,
      dependencies: counter > 2 ? [`task_${counter - 1}`] : [],
      notes: '',
      lastUpdated: new Date().toISOString()
    });
  });

  // Add cross-service integration task if multiple services
  if (services.length > 1) {
    subtasks.push({
      id: `task_${counter++}`,
      title: 'Cross-Service Integration',
      status: 'pending',
      priority: 'critical',
      complexity: 'complex',
      team: 'platform',
      service: 'integration',
      description: `Ensure seamless integration between ${services.join(', ')} services`,
      dependencies: subtasks.slice(0, -1).map(t => t.id),
      notes: 'Critical integration validation required',
      lastUpdated: new Date().toISOString()
    });
  }

  return subtasks;
}

// Task utilities
export function validate_task_dependencies(tasks: SubTask[]): boolean {
  const taskIds = new Set(tasks.map(t => t.id));

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        return false;
      }
    }
  }

  return true;
}

export function get_task_priority_score(task: SubTask): number {
  const priorityScores = { critical: 4, high: 3, medium: 2, low: 1 };
  return priorityScores[task.priority];
}

export function sort_tasks_by_priority(tasks: SubTask[]): SubTask[] {
  return tasks.sort((a, b) => get_task_priority_score(b) - get_task_priority_score(a));
}

// Analytics helpers
export function calculate_completion_rate(tasks: SubTask[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / tasks.length) * 100);
}

export function get_tasks_by_status(tasks: SubTask[]): Record<string, SubTask[]> {
  return tasks.reduce((acc, task) => {
    if (!acc[task.status]) acc[task.status] = [];
    acc[task.status].push(task);
    return acc;
  }, {} as Record<string, SubTask[]>);
}
