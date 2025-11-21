// CONDUCKS Architect Mode Logic
// Agent question generation, analysis workflows, and human-AI collaboration

import { SubTask, ArchitectJob, ArchitectTask, CONDUCKSStorage } from '../../core/types.js';
import { DOMAIN_MAPPINGS, PRIORITY_RULES } from '../../core/config.js';

// Architect Mode Configuration
export const ARCHITECT_CONFIG = {
  maxQuestionsPerAnalysis: 5,
  questionCategories: {
    TECHNICAL: 'technical',
    SCOPE: 'scope',
    DEPENDENCY: 'dependency',
    RISK: 'risk',
    TIMING: 'timing'
  },
  complexityThresholds: {
    SIMPLE: 2,      // < 2 services, < 1 week
    MEDIUM: 3,      // 2-3 services, 1-4 weeks
    COMPLEX: 8,     // 4+ services, >4 weeks
    ARCHITECTURAL: 12 // Multiple domains, cross-cutting
  }
};

// Question Template System
interface QuestionTemplate {
  category: string;
  complexity: string[];
  condition: (analysis: ArchitectAnalysis) => boolean;
  question: string;
  options?: string[];
  required: boolean;
  priority: number;
}

interface ArchitectAnalysis {
  description: string;
  services: string[];
  domain: string;
  complexity: number;
  riskFactors: string[];
  dependencies: string[];
  estimatedEffort: number;
}

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // Technical Feasibility Questions
  {
    category: 'technical',
    complexity: ['medium', 'complex', 'architectural'],
    condition: (analysis) => analysis.domain === 'ml-integration',
    question: "Should we implement collaborative filtering or content-based recommendations? Any existing ML infrastructure to leverage?",
    options: ['collaborative', 'content-based', 'hybrid', 'existing-infra'],
    required: true,
    priority: 10
  },
  {
    category: 'technical',
    complexity: ['complex', 'architectural'],
    condition: (analysis) => analysis.services.length > 2,
    question: "What databases and data sources are involved? Any existing schemas we should leverage?",
    required: true,
    priority: 9
  },
  {
    category: 'technical',
    complexity: ['architectural'],
    condition: (analysis) => analysis.domain.includes('api') || analysis.domain.includes('infrastructure'),
    question: "What are the scalability requirements? Expected load and performance metrics?",
    required: true,
    priority: 10
  },

  // Scope & Dependencies Questions
  {
    category: 'scope',
    complexity: ['medium', 'complex', 'architectural'],
    condition: (analysis) => true,
    question: "Are there any blocking dependencies or prerequisites that must be completed first?",
    required: true,
    priority: 8
  },
  {
    category: 'scope',
    complexity: ['complex', 'architectural'],
    condition: (analysis) => analysis.services.some(s => ['ml-engine', 'databaseHub'].includes(s)),
    question: "What services will this feature touch? Should we include integration testing from day one?",
    required: true,
    priority: 7
  },

  // Risk Assessment Questions
  {
    category: 'risk',
    complexity: ['complex', 'architectural'],
    condition: (analysis) => true,
    question: "What are the potential risks? Data quality issues, cold start problems, migration concerns?",
    required: true,
    priority: 9
  },

  // Timing & Resource Questions
  {
    category: 'timing',
    complexity: ['medium', 'complex', 'architectural'],
    condition: (analysis) => analysis.estimatedEffort > 2,
    question: "What's the expected timeline and resource requirements? Should this be parallel or sequential?",
    required: true,
    priority: 6
  }
];

/**
 * Generate targeted questions for agent-human dialog
 */
export function generateArchitectQuestions(description: string, services: string[]): QuestionTemplate[] {
  // Perform initial analysis
  const analysis = analyzeFeatureComplexity(description, services);

  // Determine complexity level first
  const complexityLevel = getComplexityLevel(analysis.complexity);

  // Filter and sort relevant questions
  const relevantQuestions = QUESTION_TEMPLATES
    .filter(template =>
      template.complexity.includes(complexityLevel) &&
      template.condition(analysis)
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, ARCHITECT_CONFIG.maxQuestionsPerAnalysis);

  return relevantQuestions;
}

/**
 * Analyze feature complexity for question generation
 */
export function analyzeFeatureComplexity(description: string, services: string[]): ArchitectAnalysis {
  const lowerDesc = description.toLowerCase();
  const domain = analyzeDomain(description);

  // Calculate complexity score (0-10)
  let complexity = services.length; // Base on service count

  // Add complexity for critical services
  const criticalServices = services.filter(s => Object.keys(PRIORITY_RULES.critical).includes(s));
  complexity += criticalServices.length;

  // Add complexity for cross-domain work
  const hasMultipleDomains = new Set(services.map(s => getDomainForService(s))).size > 1;
  if (hasMultipleDomains) complexity += 2;

  // Add complexity for technical debt indicators
  const techDebtFactors = ['refactor', 'migration', 'legacy', 'monolith', 'rewrite'];
  complexity += techDebtFactors.filter(word => lowerDesc.includes(word)).length;

  // Determine complexity level
  const complexityLevel = getComplexityLevel(complexity);

  // Identify risk factors
  const riskFactors = identifyRisks(description, services);

  // Estimate dependencies
  const dependencies = estimateDependencies(complexity, services);

  return {
    description,
    services,
    domain,
    complexity,
    riskFactors,
    dependencies,
    estimatedEffort: Math.ceil(complexity / 2) // Rough weeks estimation
  };
}

/**
 * Determine complexity level from score
 */
function getComplexityLevel(score: number): string {
  if (score <= ARCHITECT_CONFIG.complexityThresholds.SIMPLE) return 'simple';
  if (score <= ARCHITECT_CONFIG.complexityThresholds.MEDIUM) return 'medium';
  if (score <= ARCHITECT_CONFIG.complexityThresholds.COMPLEX) return 'complex';
  return 'architectural';
}

/**
 * Analyze domain from description keywords
 */
function analyzeDomain(description: string): string {
  const lowerDesc = description.toLowerCase();

  for (const [key, domain] of Object.entries(DOMAIN_MAPPINGS)) {
    if (lowerDesc.includes(key)) {
      return domain;
    }
  }

  return 'general-development';
}

/**
 * Map service to domain
 */
function getDomainForService(service: string): string {
  const domainMap: Record<string, string> = {
    'application': 'frontend',
    'ml-engine': 'ml-integration',
    'databaseHub': 'infrastructure',
    'datahub': 'infrastructure',
    'api': 'infrastructure'
  };
  return domainMap[service] || 'general-development';
}

/**
 * Identify potential risks
 */
function identifyRisks(description: string, services: string[]): string[] {
  const risks: string[] = [];
  const lowerDesc = description.toLowerCase();

  // Technical risks
  if (services.includes('ml-engine') && lowerDesc.includes('realtime')) {
    risks.push('real-time inference scaling');
  }

  if (services.includes('databaseHub') && lowerDesc.includes('migration')) {
    risks.push('data migration complexity');
  }

  // Business risks
  if (lowerDesc.includes('cold start') || lowerDesc.includes('new users')) {
    risks.push('cold start problem');
  }

  if (lowerDesc.includes('integrat') && services.length > 3) {
    risks.push('cross-service integration complexity');
  }

  return risks;
}

/**
 * Estimate dependencies
 */
function estimateDependencies(complexity: number, services: string[]): string[] {
  const deps: string[] = [];

  if (complexity > ARCHITECT_CONFIG.complexityThresholds.MEDIUM) {
    deps.push('design review');
  }

  if (services.includes('ml-engine')) {
    deps.push('data science consultation');
  }

  if (services.includes('databaseHub')) {
    deps.push('data architecture review');
  }

  if (complexity > ARCHITECT_CONFIG.complexityThresholds.COMPLEX) {
    deps.push('security review');
    deps.push('performance testing');
  }

  return deps;
}

/**
 * Generate Architect Mode proposal with analysis
 */
export function generateArchitectProposal(description: string, services: string[], humanResponses: Record<string, any>): ArchitectJob {
  const analysis = analyzeFeatureComplexity(description, services);
  const questions = generateArchitectQuestions(description, services);

  // Create enhanced job with analysis
  const proposal: ArchitectJob = {
    id: Date.now(), // Will be replaced with real ID
    title: generateProposalTitle(description),
    domain: analysis.domain,
    description: description,
    vision: generateVisionStatement(description, humanResponses),
    risk_assessment: analysis.riskFactors.join(', '),
    estimated_time: estimateTimeline(analysis.complexity),
    tasks: [], // Will be filled based on human approval
    crossServiceLinks: services.map(s => `${s}-integration`),
    dependencies: analysis.dependencies,
    tags: generateTags(description, services),
    architect_notes: generateArchitectNotes(analysis, humanResponses),
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  return proposal;
}

/**
 * Helper functions for proposal generation
 */
function generateProposalTitle(description: string): string {
  return description.split(' ').slice(0, 6).join(' ').replace(/\W+/g, ' ').trim().toUpperCase() + '...';
}

function generateVisionStatement(description: string, responses: Record<string, any>): string {
  // Use human responses to craft vision statement
  let vision = `Create ${description.toLowerCase()}`;

  if (responses.timing) {
    vision += ` within ${responses.timing}`;
  }

  if (responses.technical && responses.technical.includes('scalability')) {
    vision += ', ensuring scalability and performance';
  }

  return vision;
}

function estimateTimeline(complexity: number): string {
  if (complexity <= ARCHITECT_CONFIG.complexityThresholds.SIMPLE) return '1-2 weeks';
  if (complexity <= ARCHITECT_CONFIG.complexityThresholds.MEDIUM) return '2-4 weeks';
  if (complexity <= ARCHITECT_CONFIG.complexityThresholds.COMPLEX) return '1-2 months';
  return '3-6 months';
}

function generateTags(description: string, services: string[]): string[] {
  const tags: string[] = services.map(s => s.toLowerCase());
  const domainTags: Record<string, string[]> = {
    'ml-integration': ['ml', 'ai', 'recommendation'],
    'infrastructure': ['backend', 'database', 'api'],
    'poi-discovery': ['auth', 'user', 'security']
  };

  const domainTag = domainTags[analyzeDomain(description)];
  if (domainTag) tags.push(...domainTag);

  return [...new Set(tags)].slice(0, 5); // Max 5 tags
}

function generateArchitectNotes(analysis: ArchitectAnalysis, responses: Record<string, any>): string {
  return JSON.stringify({
    complexity_score: analysis.complexity,
    risk_factors: analysis.riskFactors,
    human_feedback: responses,
    analysis_timestamp: new Date().toISOString()
  });
}

/**
 * Validate proposal completeness
 */
export function validateArchitectProposal(proposal: ArchitectJob): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!proposal.vision || proposal.vision.length < 50) {
    missing.push('detailed vision statement');
  }

  if (!proposal.risk_assessment || proposal.risk_assessment.trim() === '') {
    missing.push('risk assessment');
  }

  if (!proposal.estimated_time) {
    missing.push('timeline estimation');
  }

  if (!proposal.tags || proposal.tags.length === 0) {
    missing.push('categorization tags');
  }

  return {
    valid: missing.length === 0,
    missing
  };
}
