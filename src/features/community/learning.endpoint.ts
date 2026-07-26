import * as Joi from 'joi';
import {
  Body,
  Controller,
  Get,
  Param,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import { LearningService } from '../../infrastructure/services/social/learning.service';
import { CommunityProfileService } from '../../infrastructure/services/social/community-profile.service';
import { splitList, clampInt } from './feed.endpoint';

/**
 * Guides, articles, courses and certifications.
 *
 * A guide is a one-lesson course and an article is a one-lesson course with no
 * quiz, so all three come through the same endpoints — a `Guide` entity would
 * have meant a second enrolment path, a second progress model and a second
 * search integration.
 */
@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityLearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly profiles: CommunityProfileService,
  ) {}

  @Get('courses')
  @ApiOperation({ summary: 'The catalogue' })
  public async list(
    @Query('topics') topics?: string,
    @Query('level') level?: string,
    @Query('limit') limit?: string,
  ) {
    const courses = await this.learning.listAsync({
      topics: splitList(topics),
      level,
      limit: clampInt(limit, 50, 1, 200),
    });
    return courses.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      level: c.level,
      topics: c.topics,
      coverUrl: c.coverUrl,
      estimatedMinutes: c.estimatedMinutes,
      certificationTitle: c.certificationTitle,
      enrollmentsCount: c.enrollmentsCount,
      // A course with no price is free forever — the free tier stays usable.
      priceMinor: c.priceMinor ?? null,
      currency: c.currency,
    }));
  }

  @Get('courses/:idOrSlug')
  @ApiOperation({
    summary: 'A course and its lessons',
    description:
      'Quiz answer keys are stripped until the learner has completed the course — returning them is the obvious implementation and it makes every certification worthless.',
  })
  public async get(@Param('idOrSlug') idOrSlug: string) {
    const userId = HttpContext.getCurrentUserId || null;
    const { course, lessons, enrollment } = await this.learning.getAsync(
      idOrSlug,
      userId,
    );
    return {
      course: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        summary: course.summary,
        description: course.description,
        level: course.level,
        topics: course.topics,
        coverUrl: course.coverUrl,
        estimatedMinutes: course.estimatedMinutes,
        certificationTitle: course.certificationTitle,
        passingScore: course.passingScore,
        enrollmentsCount: course.enrollmentsCount,
        completionsCount: course.completionsCount,
      },
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        kind: l.kind,
        position: l.position,
        body: l.body,
        videoUrl: l.videoUrl,
        estimatedMinutes: l.estimatedMinutes,
        questions: l.questions?.map((q) => ({
          prompt: q.prompt,
          options: q.options,
          // -1 when redacted. The client renders a quiz either way.
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
      })),
      enrollment: enrollment
        ? {
            status: enrollment.status,
            progressPercent: enrollment.progressPercent,
            completedLessonIds: enrollment.completedLessonIds,
            quizScore: enrollment.quizScore,
            completedOn: enrollment.completedOn,
          }
        : null,
    };
  }

  @HttpPost('courses/:idOrSlug/enroll')
  @UseGuards(UserAccoutGuard)
  public async enroll(@Param('idOrSlug') idOrSlug: string) {
    const enrollment = await this.learning.enrollAsync(
      idOrSlug,
      HttpContext.getCurrentUserId,
    );
    return {
      status: enrollment.status,
      progressPercent: enrollment.progressPercent,
    };
  }

  @HttpPost('courses/:courseId/lessons/:lessonId/complete')
  @UseGuards(UserAccoutGuard)
  public async completeLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
  ) {
    const enrollment = await this.learning.completeLessonAsync({
      userId: HttpContext.getCurrentUserId,
      courseId,
      lessonId,
    });
    return {
      status: enrollment.status,
      progressPercent: enrollment.progressPercent,
      completedLessonIds: enrollment.completedLessonIds,
    };
  }

  @HttpPost('courses/:courseId/lessons/:lessonId/submit')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Submit quiz answers',
    description:
      'Graded server-side. Passing the last lesson issues the certification.',
  })
  public async submitQuiz(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body() body: { answers: number[] },
  ) {
    const value = await Joi.object({
      answers: Joi.array()
        .items(Joi.number().integer().min(0).max(50))
        .max(100)
        .required(),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const result = await this.learning.submitQuizAsync({
      userId: HttpContext.getCurrentUserId,
      courseId,
      lessonId,
      answers: value.answers,
    });

    return {
      score: result.score,
      passed: result.passed,
      certification: result.certification
        ? {
            id: result.certification.id,
            title: result.certification.title,
            verificationCode: result.certification.verificationCode,
            issuedOn: result.certification.issuedOn,
          }
        : null,
    };
  }

  @Get('profiles/:handle/certifications')
  @ApiOperation({ summary: 'Certifications shown on a profile' })
  public async certifications(@Param('handle') handle: string) {
    const profile = await this.profiles.getByHandleAsync(
      handle,
      HttpContext.getCurrentUserId || null,
    );
    return profile.certifications;
  }

  @Get('certifications/:code/verify')
  @ApiOperation({
    summary: 'Verify a certification',
    description:
      'Public and unauthenticated. A certificate nobody can check is worth nothing.',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  public async verify(@Param('code') code: string) {
    return this.learning.verifyCertificationAsync(code);
  }
}
