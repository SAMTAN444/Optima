import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
});

export const UpdateProfileSchema = z.object({
  homePostal: z.string().optional(),
  homeAddress: z.string().optional(),
  homeLat: z.number().optional(),
  homeLng: z.number().optional(),
  displayName: z.string().min(2).optional(),
});

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(5, 'Comment must be at least 5 characters'),
});

export const UpdateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(5, 'Comment must be at least 5 characters'),
});

export const ReportReviewSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

export const HomeLocationSchema = z.object({
  postal: z.string().regex(/^\d{6}$/, 'Postal code must be exactly 6 digits').optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const MustHavesSchema = z.object({
  maxCommuteMins: z.number().positive().optional(),
  requiredProgrammes: z.array(z.string()).optional(),
  requiredSubjectsLanguages: z.array(z.string()).optional(),
  requiredCCAs: z.array(z.string()).optional(),
  requiredDistinctive: z.array(z.string()).optional(),
});

const RankedCriterionEnum = z.enum([
  'commute',
  'programmes',
  'subjectsLanguages',
  'ccas',
  'distinctive',
]);

export const GoodToHavesSchema = z.object({
  rankedCriteria: z.array(RankedCriterionEnum),
  desiredProgrammes: z.array(z.string()).optional(),
  desiredSubjectsLanguages: z.array(z.string()).optional(),
  desiredCCAs: z.array(z.string()).optional(),
  desiredDistinctive: z.array(z.string()).optional(),
});

// Count the number of non-empty must-have categories in a request.
// Each category (commute limit, required CCAs, etc.) counts as 1 "slot".
// Valid range: 1–4 (there are 5 categories; users must leave at least one unused).
function countMustHaveFields(mh: {
  maxCommuteMins?: number;
  requiredProgrammes?: string[];
  requiredSubjectsLanguages?: string[];
  requiredCCAs?: string[];
  requiredDistinctive?: string[];
}): number {
  let n = 0;
  if (mh.maxCommuteMins != null) n++;
  if (mh.requiredProgrammes        && mh.requiredProgrammes.length        > 0) n++;
  if (mh.requiredSubjectsLanguages && mh.requiredSubjectsLanguages.length > 0) n++;
  if (mh.requiredCCAs              && mh.requiredCCAs.length              > 0) n++;
  if (mh.requiredDistinctive       && mh.requiredDistinctive.length       > 0) n++;
  return n;
}

export const RecommendationRequestSchema = z
  .object({
    home: HomeLocationSchema,
    mustHaves: MustHavesSchema,
    goodToHaves: GoodToHavesSchema,
    /** Only used in filter/browse mode — ignored in recommendation mode */
    page: z.number().int().positive().default(1).optional(),
    pageSize: z.number().int().positive().max(200).default(15).optional(),
  })
  .refine((data) => countMustHaveFields(data.mustHaves) <= 4, {
    message: 'At most 4 must-have constraints are allowed',
    path: ['mustHaves'],
  })
  .superRefine((data, ctx) => {
    const mh = data.mustHaves;
    const rc = data.goodToHaves.rankedCriteria;

    if (mh.maxCommuteMins != null && rc.includes('commute')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"commute" is selected as a must-have (maxCommuteMins is set) and cannot also be ranked as a good-to-have',
        path: ['goodToHaves', 'rankedCriteria'],
      });
    }
    if (mh.requiredCCAs && mh.requiredCCAs.length > 0 && rc.includes('ccas')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"ccas" is selected as a must-have (requiredCCAs is non-empty) and cannot also be ranked as a good-to-have',
        path: ['goodToHaves', 'rankedCriteria'],
      });
    }
    if (mh.requiredProgrammes && mh.requiredProgrammes.length > 0 && rc.includes('programmes')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"programmes" is selected as a must-have (requiredProgrammes is non-empty) and cannot also be ranked as a good-to-have',
        path: ['goodToHaves', 'rankedCriteria'],
      });
    }
    if (mh.requiredSubjectsLanguages && mh.requiredSubjectsLanguages.length > 0 && rc.includes('subjectsLanguages')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"subjectsLanguages" is selected as a must-have (requiredSubjectsLanguages is non-empty) and cannot also be ranked as a good-to-have',
        path: ['goodToHaves', 'rankedCriteria'],
      });
    }
    if (mh.requiredDistinctive && mh.requiredDistinctive.length > 0 && rc.includes('distinctive')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"distinctive" is selected as a must-have (requiredDistinctive is non-empty) and cannot also be ranked as a good-to-have',
        path: ['goodToHaves', 'rankedCriteria'],
      });
    }
    // Commute (as must-have OR good-to-have) requires a home location
    const commuteUsed = mh.maxCommuteMins != null || rc.includes('commute');
    if (commuteUsed) {
      const hasHome = (data.home.postal && /^\d{6}$/.test(data.home.postal)) ||
        (data.home.lat != null && data.home.lng != null);
      if (!hasHome) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Home postal code is required when using commute as a criterion.',
          path: ['home'],
        });
      }
    }
  });

export const SchoolsQuerySchema = z.object({
  q: z.string().optional(),
  programme: z.union([z.string(), z.array(z.string())]).optional(),
  cca: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.union([z.string(), z.array(z.string())]).optional(),
  /** 'ip' = IP schools only, 'olevel' = O-Level (non-IP) schools only */
  ip: z.enum(['ip', 'olevel']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(20),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
export type UpdateReviewInput = z.infer<typeof UpdateReviewSchema>;
export type ReportReviewInput = z.infer<typeof ReportReviewSchema>;
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;
export type SchoolsQuery = z.infer<typeof SchoolsQuerySchema>;
