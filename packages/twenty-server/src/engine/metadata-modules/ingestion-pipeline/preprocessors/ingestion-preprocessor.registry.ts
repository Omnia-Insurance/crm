import { Injectable, Logger } from '@nestjs/common';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { HealthSherpaPolicyPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor';

export interface IngestionPreprocessor {
  preProcess(
    payload: Record<string, unknown>,
    pipeline: IngestionPipelineEntity,
    workspaceId: string,
  ): Promise<Record<string, unknown>>;
}

@Injectable()
export class IngestionPreprocessorRegistry {
  private readonly logger = new Logger(IngestionPreprocessorRegistry.name);

  constructor(
    private readonly healthSherpaPolicyPreprocessor: HealthSherpaPolicyPreprocessor,
  ) {}

  async preProcessRecords(
    records: Record<string, unknown>[],
    pipeline: IngestionPipelineEntity,
    workspaceId: string,
  ): Promise<Record<string, unknown>[]> {
    const preprocessor = this.getPreprocessor(pipeline);

    if (!preprocessor) {
      // No preprocessor configured, return records as-is
      return records;
    }

    this.logger.log(
      `Preprocessing ${records.length} records with preprocessor for pipeline ${pipeline.name}`,
    );

    // Process each record through the preprocessor
    const processedRecords: Record<string, unknown>[] = [];

    for (const record of records) {
      try {
        const processed = await preprocessor.preProcess(
          record,
          pipeline,
          workspaceId,
        );

        processedRecords.push(processed);
      } catch (error) {
        this.logger.error(
          `Failed to preprocess record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        // Re-throw to let job handler deal with retry logic
        throw error;
      }
    }

    return processedRecords;
  }

  private getPreprocessor(
    pipeline: IngestionPipelineEntity,
  ): IngestionPreprocessor | null {
    // Match preprocessor by pipeline name or target object
    // This is a simple approach - could be enhanced to use a config field

    if (
      pipeline.name.toLowerCase().includes('health sherpa') ||
      pipeline.name.toLowerCase().includes('healthsherpa')
    ) {
      return this.healthSherpaPolicyPreprocessor;
    }

    // No preprocessor for this pipeline
    return null;
  }
}
