import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Certification,
  Course,
  Enrollment,
  Invite,
  Lesson,
} from '../../../domain/entities/social';
import { InviteStatus } from '../../../domain/enums';
import { ILearningRepository } from '../../../domain/repositories/isocial.repository';

/** Matches a UUID v1–v5 in canonical form. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class LearningRepository implements ILearningRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courses: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessons: Repository<Lesson>,
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Certification)
    private readonly certifications: Repository<Certification>,
    @InjectRepository(Invite)
    private readonly invites: Repository<Invite>,
  ) {}

  /**
   * Accepts an id or a slug.
   *
   * Courses are linked by slug for SEO but referenced by id internally, and
   * making every caller decide which it holds is how you end up with two
   * lookup helpers that drift.
   */
  public async getCourseAsync(idOrSlug: string): Promise<Course | null> {
    if (!idOrSlug) return null;
    return UUID_PATTERN.test(idOrSlug)
      ? this.courses.findOne({ where: { id: idOrSlug } })
      : this.courses.findOne({ where: { slug: idOrSlug.toLowerCase() } });
  }

  public async listCoursesAsync(
    filters: { topics?: string[]; level?: string; publishedOnly?: boolean },
    limit: number,
  ): Promise<Course[]> {
    const builder = this.courses
      .createQueryBuilder('c')
      .orderBy('c."enrollmentsCount"', 'DESC')
      .addOrderBy('c."createdOn"', 'DESC')
      .limit(Math.min(limit, 200));
    if (filters.publishedOnly !== false) {
      builder.andWhere('c."isPublished" = true');
    }
    if (filters.level) {
      builder.andWhere('c."level" = :level', { level: filters.level });
    }
    if (filters.topics?.length) {
      builder.andWhere('c."topics" && :topics', { topics: filters.topics });
    }
    return builder.getMany();
  }

  public async saveCourseAsync(course: Course): Promise<Course> {
    return this.courses.save(course);
  }

  public async listLessonsAsync(courseId: string): Promise<Lesson[]> {
    return this.lessons.find({
      where: { courseId },
      order: { position: 'ASC' },
    });
  }

  public async getLessonAsync(id: string): Promise<Lesson | null> {
    if (!id) return null;
    return this.lessons.findOne({ where: { id } });
  }

  public async saveLessonAsync(lesson: Lesson): Promise<Lesson> {
    return this.lessons.save(lesson);
  }

  public async getEnrollmentAsync(
    courseId: string,
    profileId: string,
  ): Promise<Enrollment | null> {
    return this.enrollments.findOne({ where: { courseId, profileId } });
  }

  public async listEnrollmentsAsync(profileId: string): Promise<Enrollment[]> {
    return this.enrollments.find({
      where: { profileId },
      order: { createdOn: 'DESC' },
      take: 200,
    });
  }

  public async saveEnrollmentAsync(
    enrollment: Enrollment,
  ): Promise<Enrollment> {
    return this.enrollments.save(enrollment);
  }

  public async listCertificationsAsync(
    profileId: string,
  ): Promise<Certification[]> {
    return this.certifications.find({
      where: { profileId },
      order: { issuedOn: 'DESC' },
      take: 100,
    });
  }

  public async getCertificationByCodeAsync(
    code: string,
  ): Promise<Certification | null> {
    if (!code) return null;
    return this.certifications.findOne({
      where: { verificationCode: code.toUpperCase() },
    });
  }

  public async saveCertificationAsync(
    certification: Certification,
  ): Promise<Certification> {
    return this.certifications.save(certification);
  }

  public async getInviteByCodeAsync(code: string): Promise<Invite | null> {
    if (!code) return null;
    return this.invites.findOne({ where: { code: code.toUpperCase() } });
  }

  public async listInvitesAsync(inviterProfileId: string): Promise<Invite[]> {
    return this.invites.find({
      where: { inviterProfileId },
      order: { createdOn: 'DESC' },
      take: 200,
    });
  }

  public async saveInviteAsync(invite: Invite): Promise<Invite> {
    return this.invites.save(invite);
  }

  public async countAcceptedInvitesAsync(
    inviterProfileId: string,
  ): Promise<number> {
    return this.invites
      .createQueryBuilder('i')
      .where('i."inviterProfileId" = :inviterProfileId', { inviterProfileId })
      .andWhere('i."status" IN (:...statuses)', {
        statuses: [InviteStatus.Accepted, InviteStatus.Rewarded],
      })
      .getCount();
  }
}
