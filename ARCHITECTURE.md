# Architecture Context — conducks
Generated: 2026-07-17T21:06:54.943Z | Pulse: pulse_1784322409661_0u9xt

## Entry Points (top 10 by gravity)
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/core/persistence/persistence.ts::synapsepersistence` [STRUCTURE, gravity: 0.0129, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/governance/index.ts::governanceservice` [STRUCTURE, gravity: 0.0059, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/core/registry/synapse-registry.ts::synapseregistry` [STRUCTURE, gravity: 0.0043, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/gateway-service.ts::gatewayservice` [STRUCTURE, gravity: 0.0039, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/orchestrator.ts::analyzeorchestrator` [STRUCTURE, gravity: 0.0033, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/index.ts::analysisservice` [STRUCTURE, gravity: 0.0027, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/micro-pulse.ts::micropulseservice` [STRUCTURE, gravity: 0.0022, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/federation/conducks-installer.ts::conducksinstaller` [STRUCTURE, gravity: 0.0022, risk: 0.0200]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/core/persistence/persistence.ts::synapsepersistence.query` [BEHAVIOR, gravity: 0.0016, risk: 0.0600]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/governance/sentinel-rules.ts::coerce` [BEHAVIOR, gravity: 0.0014, risk: 0.3200]

## Structural Hotspots (top 10 by risk)
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/index.ts::analysisservice.analyze` [risk: 1.0000, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/orchestrator.ts::analyzeorchestrator.analyze` [risk: 1.0000, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/governance/index.ts::governanceservice.auditwithrules` [risk: 1.0000, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/core/persistence/persistence.ts::synapsepersistence.savenodes` [risk: 0.7800, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/governance/index.ts::governanceservice.audit` [risk: 0.6600, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/orchestrator.ts::analyzeorchestrator.runparallelpulse` [risk: 0.6400, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/interfaces/cli/commands/guard.ts::guardcommand.execute` [risk: 0.4800, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/conducks-core.ts::conducks.calculatecompositerisk` [risk: 0.4000, gravity: 0.0006]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/governance/sentinel-rules.ts::parseminimalyaml` [risk: 0.3600, gravity: 0.0009]
- `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/conducks-core.ts::conducks.calculatefallbackrisk` [risk: 0.3200, gravity: 0.0006]

## Active Violations (3)
- RISK_HOTSPOT: `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/index.ts::analysisservice.analyze`
- RISK_HOTSPOT: `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/orchestrator.ts::analyzeorchestrator.analyze`
- RISK_HOTSPOT: `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/governance/index.ts::governanceservice.auditwithrules`

## Framework
- Detected: express
