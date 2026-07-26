import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { customAlphabet } from 'nanoid';
import _const from '../../../core/utils/const';
import {
  Certification,
  Course,
  Enrollment,
  Lesson,
} from '../../../domain/entities/social';
import {
  EnrollmentStatus,
  LessonKind,
  Visibility,
} from '../../../domain/enums';
import {
  ILearningRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';

/**
 * Unambiguous alphabet for verification codes — no O/0, no I/1/l.
 * These get read aloud and typed from a screenshot.
 */
const verificationCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 12);

/**
 * Guides, articles, courses and the certifications they award.
 *
 * A guide is a one-lesson course; an article is a one-lesson course with no
 * quiz. That is why there is no `Guide` and no `Article` entity — three
 * near-identical tables would mean three enrolment paths, three progress
 * models and three search integrations, all subtly different within a year.
 */
@Injectable()
export class LearningService {
  constructor(
    @Inject(_const.ILEARNING_REPOSITORY)
    private readonly learning: ILearningRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async listAsync(filters: {
    topics?: string[];
    level?: string;
    limit?: number;
  }): Promise<Course[]> {
    return this.learning.listCoursesAsync(
      { topics: filters.topics, level: filters.level, publishedOnly: true },
      filters.limit ?? 50,
    );
  }

  public async getAsync(
    idOrSlug: string,
    userId: string | null,
  ): Promise<{
    course: Course;
    lessons: Lesson[];
    enrollment: Enrollment | null;
  }> {
    const course = await this.learning.getCourseAsync(idOrSlug);
    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found.');
    }

    const lessons = await this.learning.listLessonsAsync(course.id);
    const profile = userId
      ? await this.profiles.getByUserIdAsync(userId)
      : null;
    const enrollment = profile
      ? await this.learning.getEnrollmentAsync(course.id, profile.id)
      : null;

    return {
      course,
      // Quiz answers never leave the server for a learner who has not passed.
      // Returning `correctIndex` to the browser makes the certification
      // worthless, and it would be returned by the obvious implementation.
      lessons: lessons.map((lesson) =>
        this.redactAnswers(lesson, enrollment?.status),
      ),
      enrollment,
    };
  }

  public async enrollAsync(
    idOrSlug: string,
    userId: string,
  ): Promise<Enrollment> {
    const course = await this.learning.getCourseAsync(idOrSlug);
    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found.');
    }

    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const existing = await this.learning.getEnrollmentAsync(
      course.id,
      profile.id,
    );
    if (existing) return existing;

    const enrollment = await this.learning.saveEnrollmentAsync(
      new Enrollment({
        courseId: course.id,
        profileId: profile.id,
        status: EnrollmentStatus.Enrolled,
        completedLessonIds: [],
        progressPercent: 0,
      }),
    );

    await this.learning.saveCourseAsync(
      Object.assign(course, {
        enrollmentsCount: course.enrollmentsCount + 1,
      }),
    );
    return enrollment;
  }

  /** Mark a lesson complete and recompute progress. Idempotent. */
  public async completeLessonAsync(input: {
    userId: string;
    courseId: string;
    lessonId: string;
  }): Promise<Enrollment> {
    const { enrollment, lessons, course } = await this.requireEnrollmentAsync(
      input.userId,
      input.courseId,
    );

    if (!lessons.some((l) => l.id === input.lessonId)) {
      throw new NotFoundException('Lesson not found in this course.');
    }

    const completed = new Set(enrollment.completedLessonIds);
    completed.add(input.lessonId);

    enrollment.completedLessonIds = Array.from(completed);
    enrollment.progressPercent = Math.round(
      (completed.size / Math.max(1, lessons.length)) * 100,
    );
    enrollment.status =
      enrollment.progressPercent >= 100
        ? enrollment.status === EnrollmentStatus.Completed
          ? EnrollmentStatus.Completed
          : EnrollmentStatus.InProgress
        : EnrollmentStatus.InProgress;

    const saved = await this.learning.saveEnrollmentAsync(enrollment);

    // A course with no quiz completes on the last lesson. One with a quiz
    // waits for a passing score — otherwise the certificate means "I scrolled".
    const hasQuiz = lessons.some((l) => l.kind === LessonKind.Quiz);
    if (!hasQuiz && saved.progressPercent >= 100) {
      await this.completeAsync(saved, course, lessons, null);
    }
    return saved;
  }

  /**
   * Submit quiz answers.
   *
   * Grading happens here, never in the client, and the answer key is only
   * loaded server-side. Returns the score and whether it passed; the
   * certification is issued as a side effect of passing.
   */
  public async submitQuizAsync(input: {
    userId: string;
    courseId: string;
    lessonId: string;
    answers: number[];
  }): Promise<{
    score: number;
    passed: boolean;
    certification: Certification | null;
  }> {
    const { enrollment, lessons, course } = await this.requireEnrollmentAsync(
      input.userId,
      input.courseId,
    );

    const lesson = await this.learning.getLessonAsync(input.lessonId);
    if (!lesson || lesson.courseId !== course.id) {
      throw new NotFoundException('Quiz not found in this course.');
    }
    if (lesson.kind !== LessonKind.Quiz || !lesson.questions?.length) {
      throw new BadRequestException('That lesson is not a quiz.');
    }

    const questions = lesson.questions;
    if (input.answers.length !== questions.length) {
      throw new BadRequestException(
        `Answer all ${questions.length} questions before submitting.`,
      );
    }

    const correct = questions.reduce(
      (count, question, index) =>
        question.correctIndex === input.answers[index] ? count + 1 : count,
      0,
    );
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= course.passingScore;

    enrollment.quizScore = Math.max(enrollment.quizScore ?? 0, score);
    const completed = new Set(enrollment.completedLessonIds);
    if (passed) completed.add(lesson.id);
    enrollment.completedLessonIds = Array.from(completed);
    enrollment.progressPercent = Math.round(
      (completed.size / Math.max(1, lessons.length)) * 100,
    );

    const saved = await this.learning.saveEnrollmentAsync(enrollment);

    let certification: Certification | null = null;
    if (passed && saved.progressPercent >= 100) {
      certification = await this.completeAsync(saved, course, lessons, score);
    }
    return { score, passed, certification };
  }

  public async listCertificationsAsync(
    profileId: string,
  ): Promise<Certification[]> {
    return this.learning.listCertificationsAsync(profileId);
  }

  /** Public verification. No account needed — that is the point of a code. */
  public async verifyCertificationAsync(code: string): Promise<{
    valid: boolean;
    title?: string;
    holder?: string;
    issuedOn?: Date;
  }> {
    const certification = await this.learning.getCertificationByCodeAsync(code);
    if (!certification) return { valid: false };
    if (
      certification.expiresOn &&
      certification.expiresOn.getTime() < Date.now()
    ) {
      return { valid: false };
    }

    const holder = await this.profiles.getByIdAsync(certification.profileId);
    return {
      valid: true,
      title: certification.title,
      holder: holder?.displayName,
      issuedOn: certification.issuedOn,
    };
  }

  /* ------------------------------------------------------------- internals */

  private async requireEnrollmentAsync(
    userId: string,
    courseId: string,
  ): Promise<{ enrollment: Enrollment; lessons: Lesson[]; course: Course }> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const course = await this.learning.getCourseAsync(courseId);
    if (!course) throw new NotFoundException('Course not found.');

    const enrollment = await this.learning.getEnrollmentAsync(
      course.id,
      profile.id,
    );
    if (!enrollment) {
      throw new BadRequestException('Enrol in this course first.');
    }

    return {
      enrollment,
      lessons: await this.learning.listLessonsAsync(course.id),
      course,
    };
  }

  private async completeAsync(
    enrollment: Enrollment,
    course: Course,
    lessons: Lesson[],
    score: number | null,
  ): Promise<Certification | null> {
    if (enrollment.status === EnrollmentStatus.Completed) return null;

    enrollment.status = EnrollmentStatus.Completed;
    enrollment.completedOn = new Date();
    enrollment.progressPercent = 100;
    await this.learning.saveEnrollmentAsync(enrollment);

    await this.learning.saveCourseAsync(
      Object.assign(course, {
        completionsCount: course.completionsCount + 1,
      }),
    );

    if (!course.certificationTitle) return null;

    const certification = await this.learning.saveCertificationAsync(
      new Certification({
        profileId: enrollment.profileId,
        courseId: course.id,
        title: course.certificationTitle,
        verificationCode: verificationCode(),
        score: score ?? enrollment.quizScore ?? undefined,
        issuedOn: new Date(),
        visibility: Visibility.Public,
      }),
    );

    this.eventEmitter.emit('social.certification.issued', {
      profileId: enrollment.profileId,
      courseId: course.id,
      certificationId: certification.id,
      title: certification.title,
      lessonsCount: lessons.length,
    });
    return certification;
  }

  /**
   * Strip the answer key unless the learner has already completed the course.
   *
   * The obvious implementation returns the lesson as stored, which ships
   * `correctIndex` to the browser and makes every certification meaningless.
   */
  private redactAnswers(
    lesson: Lesson,
    status: EnrollmentStatus | undefined,
  ): Lesson {
    if (lesson.kind !== LessonKind.Quiz || !lesson.questions) return lesson;
    if (status === EnrollmentStatus.Completed) return lesson;

    return Object.assign(Object.create(Object.getPrototypeOf(lesson)), lesson, {
      questions: lesson.questions.map((q) => ({
        prompt: q.prompt,
        options: q.options,
        correctIndex: -1,
        explanation: undefined,
      })),
    }) as Lesson;
  }
}
