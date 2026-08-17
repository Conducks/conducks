# domain/coverage — an external report, joined to the graph

**Layer:** domain. `domain/coverage/coverage-bind.ts`, `coverage-baseline.ts`.

**Read at `8d4e7ff`.** Split out of `domain/analysis` on 2026-08-17, for the same measured reason as
`domain/docs`: these two files import nothing else in that folder.

**Responsibility:** parse what a test run measured, range-join it onto node spans, and compare a run
against a recorded baseline.

**Boundaries:** it does not decide what is covered. It reads a report and binds it.

## Reading a report rather than inferring coverage IS the feature

There was another way of answering this, and it ran on every analyze for months. `TestAligner` walked
from every test node to depth 5 and marked whatever it reached as covered-by-that-test — a structural
guess, not a measurement.

It was removed on 2026-08-17, for two reasons that were each sufficient. It wrote `coveredBy` onto the
object `getNode` RETURNS, which is a merged copy rather than the node the graph holds, so the write
was lost; and nothing read the property either way. `mirror.engine` had read it until the visual wave
moved to SQL (ADR 0054), and the reader went without the writer.

So the distinction is not academic. A depth-5 walk says "this test reaches that function". An
istanbul report says "these lines executed". Only one of them is evidence, and the codebase carried
both until one was measured.

## The baseline is what makes a number a verdict

A coverage percentage on its own is a fact nobody acts on. `coverage-baseline` records a run so the
next one can be compared to it, which turns the number into a direction — and a direction is the only
form of this measurement a gate can use.
