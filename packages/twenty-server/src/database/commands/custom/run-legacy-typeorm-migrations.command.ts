import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { Command, CommandRunner } from 'nest-commander';
import { DataSource } from 'typeorm';

// OMNIA-CUSTOM: the Helm migration job runs this before `upgrade`, which never
// runs the frozen legacy folder; run-instance-commands would also run instance
// commands and refuses a cross-version jump without --force.
@Command({
  name: 'omnia:run-legacy-typeorm-migrations',
  description:
    'Run pending legacy TypeORM migrations only, without any instance or workspace upgrade command',
})
export class RunLegacyTypeOrmMigrationsCommand extends CommandRunner {
  private readonly logger = new Logger(RunLegacyTypeOrmMigrationsCommand.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async run(): Promise<void> {
    this.logger.log('Running legacy TypeORM migrations...');

    const migrations = await this.dataSource.runMigrations({
      transaction: 'each',
    });

    if (migrations.length === 0) {
      this.logger.log('No pending legacy migrations');

      return;
    }

    this.logger.log(
      `Executed ${migrations.length} legacy migration(s): ${migrations.map((migration) => migration.name).join(', ')}`,
    );
  }
}
