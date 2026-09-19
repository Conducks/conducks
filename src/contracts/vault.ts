/**
 * Where the vault lives, and what it is called.
 *
 * Every layer needs this: persistence writes it, the federated linker opens a neighbour's, the
 * monitor stats it for freshness, and `doctor` and `list` each decide from it whether a project has
 * been analyzed at all. Eight places held the literal and one of them held a different set:
 * `doctor` also accepted `synapse.db` and `conducks.db`, names nothing writes and nothing migrates,
 * so it reported a vault where `list` reported `not-analyzed` for the same project.
 *
 * A filename is a contract between a writer and every reader. One declaration, so a rename is one
 * edit rather than a hunt.
 */
export const VAULT_DIR = '.conducks';
export const VAULT_DB_FILENAME = 'conducks-synapse.db';
