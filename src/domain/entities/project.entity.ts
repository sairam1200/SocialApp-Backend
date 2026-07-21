import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'project', schema: 'public' })
export class Project {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ name: 'client_id', type: 'text' })
  clientId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  budget: string | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'payment_type', type: 'varchar', length: 50, default: 'fixed' })
  paymentType: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  timeline: string | null;

  @Column('text', { array: true, default: '{}' })
  skills: string[];

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: string;

  @Column({ name: 'project_type', type: 'varchar', length: 50, nullable: true, default: 'open' })
  projectType: string;

  @Column({ name: 'is_confidential', type: 'boolean', default: false })
  isConfidential: boolean;

  @Column('text', { array: true, name: 'invitation_list', default: '{}' })
  invitationList: string[];

  @Column({ name: 'bounty_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  bountyAmount: string | null;

  @Column({ name: 'trial_duration', type: 'int', nullable: true })
  trialDuration: number | null;

  @Column({ name: 'hire_on_completion', type: 'boolean', default: false })
  hireOnCompletion: boolean;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
