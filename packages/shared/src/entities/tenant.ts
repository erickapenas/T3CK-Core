import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('tenants')
@Index(['domain'], { unique: true })
@Index(['companyName'])
@Index(['status'])
@Index(['createdAt'])
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  domain!: string;

  @Column({ type: 'varchar', length: 255 })
  companyName!: string;

  @Column({ type: 'varchar', length: 255 })
  contactEmail!: string;

  @Column({ type: 'int', default: 50 })
  numberOfSeats!: number;

  @Column({ type: 'enum', enum: ['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETED'], default: 'PENDING' })
  status!: 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';

  @Column({ type: 'text', nullable: true })
  billingAddress?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  billingCountry?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  billingZipCode?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyBudget!: number;

  @Column({ type: 'varchar', length: 50, default: 'ACTIVE' })
  billingStatus!: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  provisionedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provisioningJobId?: string;
}
