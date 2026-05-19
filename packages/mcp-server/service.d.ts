type JsonRecord = Record<string, unknown>;
interface ServiceRoots {
    dataRoot?: string;
    stateRoot?: string;
}
interface ToolResult {
    tool: string;
    result: unknown;
}
export declare class JobSearchService {
    private readonly dataRoot;
    private readonly stateRoot;
    constructor(roots?: ServiceRoots);
    private ensureProjection;
    private replayProjection;
    private appendAudit;
    private listVacancyRows;
    private listApplicationRows;
    private listEventRows;
    private listScheduleRows;
    private resolveApplicationPaths;
    private resolveVacancyPath;
    private resolveProposalPath;
    listVacancies(args?: {
        limit?: number;
        status?: string | null;
    }): Promise<ToolResult>;
    getVacancy(args: {
        id: string;
    }): Promise<ToolResult>;
    getApplicationPack(args: {
        id: string;
    }): Promise<ToolResult>;
    listApplications(args?: {
        channel?: string | null;
        limit?: number;
        status?: string | null;
        vacancy_id?: string | null;
    }): Promise<ToolResult>;
    getFunnel(): Promise<ToolResult>;
    searchPerformance(): Promise<ToolResult>;
    listSchedules(args?: {
        dueOnly?: boolean;
    }): Promise<ToolResult>;
    nextActions(args?: {
        horizon?: "today" | "week";
    }): Promise<ToolResult>;
    getOperatorStatus(): Promise<ToolResult>;
    bootstrapOperator(): Promise<ToolResult>;
    writeOnboardingProfile(args: {
        profile: JsonRecord;
        resume_text?: string | null;
        resume_json?: JsonRecord | null;
        active_strategy?: JsonRecord | null;
        answers_markdown?: string | null;
        source_note?: string | null;
    }): Promise<ToolResult>;
    writeSessionLog(args: {
        session_id: string;
        summary_markdown: string;
        tool_calls?: JsonRecord[] | null;
        changed_paths?: string[] | null;
        blockers?: string[] | null;
        next_actions?: string[] | null;
        ts?: string | null;
    }): Promise<ToolResult>;
    writeJournalEntry(args: {
        entry_id: string;
        summary_markdown: string;
        period?: string | null;
        role?: string | null;
        evidence_refs?: string[] | null;
        changed_paths?: string[] | null;
        ts?: string | null;
    }): Promise<ToolResult>;
    createVacancy(args: {
        vacancy: JsonRecord;
        markdown?: string | null;
    }): Promise<ToolResult>;
    createApplication(args: {
        application: JsonRecord;
        cover_letter?: JsonRecord | null;
    }): Promise<ToolResult>;
    createApplicationPackage(args: {
        application: JsonRecord;
        cover_letter?: JsonRecord | null;
        letter_markdown?: string | null;
        screening_answers_markdown?: string | null;
        resume_variant_ref?: JsonRecord | null;
        reviewer_verdict?: JsonRecord | null;
        outbox?: JsonRecord | null;
    }): Promise<ToolResult>;
    writeApplicationAsset(args: {
        application_id: string;
        kind: "letter_markdown" | "screening_answers_markdown" | "resume_variant_ref" | "reviewer_verdict" | "outbox";
        content?: string | null;
        payload?: JsonRecord | null;
    }): Promise<ToolResult>;
    updateApplicationStatus(args: {
        id: string;
        status: string;
        reason?: string | null;
        evidence_ref?: string | null;
        human_confirmation?: boolean | null;
    }): Promise<ToolResult>;
    logEvent(args: {
        event: JsonRecord;
        evidence_text?: string | null;
        evidence_name?: string | null;
        human_confirmation?: boolean | null;
    }): Promise<ToolResult>;
    proposeStrategyChange(args: {
        proposal: JsonRecord;
    }): Promise<ToolResult>;
    autoDecideStrategy(args: {
        proposal?: JsonRecord;
        proposal_id?: string;
    }): Promise<ToolResult>;
    applyStrategyChange(args: {
        decision: string;
        proposal?: JsonRecord;
        proposal_id?: string;
    }): Promise<ToolResult>;
    updatePerformance(): Promise<ToolResult>;
    ingestSession(args: {
        session_id: string;
        transcript: string;
        role?: string | null;
        ts?: string | null;
    }): Promise<ToolResult>;
    callTool(name: string, args?: JsonRecord): Promise<ToolResult>;
}
export declare function getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: JsonRecord;
}>;
export {};
