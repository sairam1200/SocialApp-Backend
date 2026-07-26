import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import {
  CourseLevel,
  EnrollmentStatus,
  InviteStatus,
  LessonKind,
  Visibility,
} from '../../enums';

/**
 * A guide, an article or a course — all three are a `Course` with a different
 * number of lessons. A guide is a one-lesson course; an article is a
 * one-lesson course with no quiz. Splitting them would triple the enrolment,
 * progress and search code for no gain.
 */
@Entity({ name: 'courses', schema: 'social' })
export class Course extends BaseEntity {
  @Column({ type: 'varchar', length: 120, unique: true })
  @Index('idx_courses_slug')
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  summary?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid', nullable: true })
  @Index('idx_courses_author')
  authorProfileId?: string | null;

  @Column({ type: 'enum', enum: CourseLevel, default: CourseLevel.Beginner })
  level: CourseLevel;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  topics: string[];

  @Column({ type: 'varchar', length: 1024, nullable: true })
  coverUrl?: string;

  @Column({ type: 'integer', default: 0 })
  estimatedMinutes: number;

  @Column({ type: 'boolean', default: true })
  @Index('idx_courses_published')
  isPublished: boolean;

  /** Free tier stays usable: a course with a null price is free forever. */
  @Column({ type: 'bigint', nullable: true })
  priceMinor?: string | null;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  /** Awarded on completion and shown on the learner's profile. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  certificationTitle?: string;

  /** Percentage of quiz questions needed to pass. */
  @Column({ type: 'integer', default: 70 })
  passingScore: number;

  @Column({ type: 'integer', default: 0 })
  enrollmentsCount: number;

  @Column({ type: 'integer', default: 0 })
  completionsCount: number;

  @Column({ type: 'text', nullable: true })
  searchText?: string;

  constructor(request: Partial<Course> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'lessons', schema: 'social' })
export class Lesson extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_lessons_course')
  courseId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'enum', enum: LessonKind, default: LessonKind.Article })
  kind: LessonKind;

  @Column({ type: 'integer', default: 0 })
  position: number;

  /** Markdown for an article lesson. */
  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  videoUrl?: string;

  @Column({ type: 'integer', default: 5 })
  estimatedMinutes: number;

  /** Quiz questions when `kind = quiz`. Answers are indexes into `options`. */
  @Column({ type: 'jsonb', nullable: true })
  questions?: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
  }> | null;

  constructor(request: Partial<Lesson> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'enrollments', schema: 'social' })
@Unique('uq_enrollments', ['courseId', 'profileId'])
export class Enrollment extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_enrollments_course')
  courseId: string;

  @Column({ type: 'uuid' })
  @Index('idx_enrollments_profile')
  profileId: string;

  @Column({
    type: 'enum',
    enum: EnrollmentStatus,
    default: EnrollmentStatus.Enrolled,
  })
  status: EnrollmentStatus;

  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  completedLessonIds: string[];

  @Column({ type: 'integer', default: 0 })
  progressPercent: number;

  @Column({ type: 'integer', nullable: true })
  quizScore?: number;

  @Column({ type: 'timestamptz', nullable: true })
  completedOn?: Date | null;

  constructor(request: Partial<Enrollment> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * An earned certification, shown on the profile.
 *
 * `verificationCode` makes it checkable by anyone without an account, which is
 * the only thing that makes a self-issued certificate worth anything.
 */
@Entity({ name: 'certifications', schema: 'social' })
export class Certification extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_certifications_profile')
  profileId: string;

  @Column({ type: 'uuid' })
  courseId: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 24, unique: true })
  @Index('idx_certifications_code')
  verificationCode: string;

  @Column({ type: 'integer', nullable: true })
  score?: number;

  @Column({ type: 'timestamptz' })
  issuedOn: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresOn?: Date | null;

  @Column({ type: 'enum', enum: Visibility, default: Visibility.Public })
  visibility: Visibility;

  constructor(request: Partial<Certification> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * An invitation, and the reward it earned.
 *
 * The reward is granted when the invitee completes onboarding, not when they
 * sign up — otherwise the cheapest way to farm rewards is to create accounts.
 */
@Entity({ name: 'invites', schema: 'social' })
export class Invite extends BaseEntity {
  @Column({ type: 'varchar', length: 16, unique: true })
  @Index('idx_invites_code')
  code: string;

  @Column({ type: 'uuid' })
  @Index('idx_invites_inviter')
  inviterProfileId: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  invitedEmail?: string;

  @Column({ type: 'uuid', nullable: true })
  acceptedByProfileId?: string | null;

  @Column({ type: 'enum', enum: InviteStatus, default: InviteStatus.Sent })
  @Index('idx_invites_status')
  status: InviteStatus;

  /** Minor units credited to the inviter's ledger when the invite converts. */
  @Column({ type: 'bigint', default: 0 })
  rewardMinor: string;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedOn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresOn?: Date | null;

  constructor(request: Partial<Invite> = {}) {
    super();
    Object.assign(this, request);
  }
}
