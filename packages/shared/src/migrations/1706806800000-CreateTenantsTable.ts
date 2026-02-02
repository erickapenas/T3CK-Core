import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTenantsTable1706806800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tenants',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'domain',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'companyName',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'contactEmail',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'numberOfSeats',
            type: 'int',
            default: 50,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETED'],
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'billingAddress',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'billingCountry',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'billingZipCode',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'monthlyBudget',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'billingStatus',
            type: 'varchar',
            length: '50',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'provisionedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'provisioningJobId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
        ],
      })
    );

    // Create indexes
    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'IDX_tenants_domain',
        columnNames: ['domain'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'IDX_tenants_companyName',
        columnNames: ['companyName'],
      })
    );

    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'IDX_tenants_status',
        columnNames: ['status'],
      })
    );

    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'IDX_tenants_createdAt',
        columnNames: ['createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tenants');
  }
}
