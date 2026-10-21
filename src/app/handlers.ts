import { z } from 'zod';
import type { BrowserSession } from '../browser/session.js';
import type { WorkflowRegistry } from './registry.js';
import { compileTool } from '../workflow/candidate.js';
import { commandSchema, discovery } from '../contracts/commands.js';
import { failure, success, type Result } from '../contracts/results.js';
import { inspectRecording } from '../../spike/inspect.js';
import { infer } from '../../spike/infer.js';
export async function handle(input: unknown, registry?: WorkflowRegistry, session?: BrowserSession, stateDir?: string): Promise<Result> {
  try {
    if (Buffer.byteLength(JSON.stringify(input)) > 1024 * 1024) return failure('BUDGET_EXCEEDED', 'Input exceeds the 1 MiB limit.');
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) return failure('INVALID_INPUT', 'Command does not match the input schema.', 'Call commands or schema.');
    const command = parsed.data;
    switch (command.command) {
      case 'compile_recordings': {
        if (!session) return failure('AUTH_REQUIRED', 'Open an authorized browser session first.');
        if (command.ids.length !== command.requestIds.length || command.specification.origin !== session.scope.origin) return failure('INVALID_INPUT', 'Recording selection does not match scope.');
        const demos = command.ids.map((id, index) => { const record = session.recording(id); const request = record.observations.find(item => item.id === command.requestIds[index]); if (!request) throw new Error('INVALID_INPUT'); return { inputs: record.inputs, request }; });
        return success(compileTool(demos, command.specification));
      }
      case 'record_start': if (!session) return failure('AUTH_REQUIRED', 'Open and authorize a dedicated browser first.'); await session.start(command.inputs); return success({ recording: true });
      case 'record_stop': return session ? success(await session.stop()) : failure('AUTH_REQUIRED', 'Open and authorize a dedicated browser first.');
      case 'recording': return session ? success(session.recording(command.id)) : failure('AUTH_REQUIRED', 'Open and authorize a dedicated browser first.');
      case 'tools': return registry ? success({ tools: registry.list() }) : failure('BROKER_UNAVAILABLE', 'Connect to a running broker.');
      case 'run': return registry ? success(await registry.run(command.id, command.inputs)) : failure('BROKER_UNAVAILABLE', 'Connect to a running broker.');
      case 'verify': return registry && stateDir ? success(await registry.verify(command.id, command.inputs, command.expected, stateDir)) : failure('BROKER_UNAVAILABLE', 'Connect to a running broker.');
      case 'candidate': return success(compileTool(command.demonstrations, command.specification));
      case 'commands': return success({ commands: discovery });
      case 'schema': return success(z.toJSONSchema(commandSchema));
      case 'inspect': { const report = inspectRecording(command.recording); return success(report, report.complete); }
      case 'infer': return success(infer(command.demonstrations));
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (['REVIEW_REQUIRED', 'AUTH_REQUIRED', 'APPROVAL_REQUIRED', 'BUDGET_EXCEEDED', 'OUTCOME_UNKNOWN', 'UNSUPPORTED_FEATURE'].includes(code)) return failure(code as import('../contracts/results.js').ErrorCode, code.replace(/_/g, ' ').toLowerCase() + '.');
    if (code === 'EVIDENCE_SAVE_FAILED') return failure('EVIDENCE_SAVE_FAILED', 'Read completed, but verification evidence could not be saved.');
    if (['UPSTREAM_REJECTED', 'UPSTREAM_FAILED', 'UPSTREAM_TIMEOUT', 'INVALID_RESPONSE', 'UNSUPPORTED_RESPONSE', 'UNSUPPORTED_AUTH', 'CONTRACT_MISMATCH'].includes(code) || (error as NodeJS.ErrnoException)?.code?.startsWith('EAI_') || (error as NodeJS.ErrnoException)?.code === 'ENOTFOUND') return failure('EXECUTION_FAILED', 'Reviewed read could not complete; no verification verdict was saved.');
    return failure('INVALID_INPUT', 'Invalid command data.');
  }
}
