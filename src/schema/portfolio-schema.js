/**
 * The portfolio data model.
 *
 * This file is the contract between the person writing `portfolio.yaml` and
 * everything else in AutoPortfolio: the validator, the view model, every
 * template and — since the documentation is generated from it — the field
 * reference in `docs/`.
 *
 * Design rules:
 *
 * 1. **Every section is optional.** A portfolio with no certifications must not
 *    require an empty `certifications:` key.
 * 2. **Shorthands collapse to one shape.** `skills: [Rust]` and
 *    `skills: [{ name: Rust }]` produce the same model, so templates never see
 *    the difference.
 * 3. **Unknown keys are reported.** A typo such as `techologies:` would
 *    otherwise silently delete a section.
 *
 * @module schema/portfolio-schema
 */

import { HOST_KEYS } from '../model/hosts.js';
import {
  bool,
  color,
  date,
  dict,
  email,
  enumOf,
  int,
  list,
  markdown,
  nameList,
  num,
  obj,
  phone,
  str,
  strList,
  url,
  anyOf,
} from './fields.js';

/** The version of the data model itself, not of AutoPortfolio. */
export const DATA_VERSION = '1.0';

/**
 * Default headings for the built-in sections. A template may override them, and
 * `sections.labels` in the configuration overrides them per project.
 */
export const SECTION_LABELS = Object.freeze({
  about: 'About',
  skills: 'Skills',
  languages: 'Languages',
  spokenLanguages: 'Spoken languages',
  technologies: 'Technologies',
  projects: 'Projects',
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
  awards: 'Awards',
  publications: 'Publications',
  testimonials: 'Testimonials',
  social: 'Elsewhere',
  contact: 'Contact',
});

/** @typedef {import('./fields.js').Field} Field */

/** Values accepted where a "how well do you know this" level is expected. */
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

/** Employment types used by the timeline layouts. */
export const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'freelance',
  'internship',
  'apprenticeship',
  'self-employed',
  'volunteer',
];

const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const AVAILABILITY = ['available', 'open-to-offers', 'open-to-freelance', 'employed', 'not-available'];
const PROFICIENCY = ['native', 'fluent', 'professional', 'intermediate', 'basic'];
const PROJECT_STATUS = ['concept', 'planning', 'in-progress', 'active', 'maintained', 'archived'];
const SECTION_LAYOUTS = ['prose', 'cards', 'timeline', 'list', 'links', 'stats', 'gallery'];

/**
 * An image reference. `alt` is optional in the schema but missing alt text is
 * reported by the semantic checks: generated sites should be accessible by
 * default.
 */
export const image = /** @type {Field} */ (
  obj(
    {
      src: str({
        required: true,
        label: 'image.src',
        description: 'Path relative to the configuration file, or an absolute URL.',
        example: 'assets/avatar.jpg',
      }),
      alt: str({
        description: 'Alternative text. Use `""` for purely decorative images.',
        example: 'The dashboard of the example app',
      }),
      caption: str({ description: 'Caption shown under the image.' }),
      width: int({ description: 'Intrinsic width in pixels, used to reserve space.' }),
      height: int({ description: 'Intrinsic height in pixels, used to reserve space.' }),
      focal: str({ description: 'CSS `object-position`, e.g. `50% 20%`.' }),
      priority: bool({ description: 'Preload this image in the document head.' }),
    },
    { from: 'src' },
  )
);

/** A named link. Accepts `url: https://…` for brevity. */
export const link = /** @type {Field} */ (
  anyOf(
    [
      str({ label: 'url' }),
      obj(
        {
          url: url({
            required: true,
            description: 'Where the link points.',
          }),
          label: str({ description: 'Text shown instead of the key name.' }),
          icon: str({ description: 'Override the icon used by templates.' }),
          handle: str({ description: 'Username shown next to the link.', example: '@octocat' }),
          primary: bool({ description: 'Highlight the link in the hero and contact sections.' }),
        },
        { from: 'url' },
      ),
    ],
    { label: 'link' },
  )
);

const linkMap = (description) => dict(link, { description });

/** Start/end metadata shared by every timeline entry. */
const entryDates = {
  start: date({ description: 'When it started.', example: '2023-04' }),
  end: date({ description: 'When it ended. Use `present` for ongoing work.', example: 'present' }),
  current: bool({ description: 'Shorthand for `end: present`.' }),
};

const entryBase = {
  summary: str({ description: 'One line summarising the entry, shown in compact layouts.' }),
  description: markdown({ description: 'A paragraph or two. Markdown is supported.' }),
  highlights: strList({ description: 'Bullet points. Keep each one to a single line.' }),
  url: url({ description: 'Canonical page for the entry.' }),
  logo: str({ description: 'Path to a logo image, copied into the site.' }),
  location: str({ description: 'City, Country.' }),
  ...entryDates,
};

/**
 * The full portfolio schema. `normalizePortfolio` in `src/model/normalize.js`
 * turns the validated value into the model the templates consume.
 */
export const portfolioSchema = /** @type {Field} */ (
  obj(
    {
      version: str({
        description: `Data model version. Current: \`${DATA_VERSION}\`.`,
        example: DATA_VERSION,
      }),

      meta: obj({
        title: str({
          description: 'Browser title and social preview title. Defaults to `profile.name`.',
        }),
        description: str({
          description: 'Meta description. Around 150 characters works best.',
          max: 320,
        }),
        language: str({ description: 'BCP-47 language of the content.', example: 'en' }),
        locale: str({ description: 'Locale used for formatting dates.', example: 'en-GB' }),
        keywords: strList({ description: 'Meta keywords. A handful is enough.' }),
        author: str({ description: 'Author name for `<meta name="author">`.' }),
        siteUrl: url({
          description: 'Canonical URL of the deployed site. Required for sitemap.xml.',
          example: 'https://your-domain.example',
        }),
        themeColor: color({ description: 'Browser UI colour on mobile.' }),
        image: image,
        robots: str({ description: 'Robots directive for pages that need one.', example: 'index,follow' }),
      }),

      profile: obj(
        {
          name: str({
            required: true,
            description: 'Your name. Used in the title, the hero and structured data.',
            example: 'Eric Lönnrot',
          }),
          firstName: str({ description: 'Used where only the first name fits.' }),
          pronouns: str({ description: 'Shown next to your name.', example: 'he/him' }),
          headline: str({
            description: 'One line under your name. Say what you do, not "software engineer".',
            example: 'Systems engineer · search infrastructure',
          }),
          shortBio: str({
            description: 'One or two sentences for the hero.',
            aliases: ['bio', 'tagline'],
          }),
          about: markdown({
            description: 'The longer introduction. Rendered in the about section.',
          }),
          avatar: image,
          location: str({ description: 'City, Country.', example: 'Lisbon, Portugal' }),
          company: str({ description: 'Current company, shown in structured data.' }),
          jobTitle: str({ description: 'Current role title.' }),
          availability: enumOf(AVAILABILITY, {
            description: 'Availability badge shown in the hero and contact sections.',
          }),
          availabilityNote: str({ description: 'Extra sentence about availability.' }),
          yearsOfExperience: num({ description: 'Used in the hero stat.', min: 0, max: 80 }),
          resume: url({ description: 'Link to a PDF resume, shown as a hero action.' }),
          timezone: str({ description: 'Shown in the contact section.', example: 'UTC+1' }),
          logo: str({ description: 'Optional logo or monogram image.' }),
        },
        { required: true, description: 'Who the portfolio belongs to.' },
      ),

      contact: obj({
        email: email({ description: 'Public email address. Obfuscated in the generated HTML.' }),
        phone: phone({ description: 'Phone number in international format.' }),
        location: str({ description: 'Where you are, if it differs from `profile.location`.' }),
        timezone: str({ description: 'Timezone shown as text.', example: 'Europe/Lisbon' }),
        availability: enumOf(AVAILABILITY, { description: 'Overrides `profile.availability`.' }),
        preferred: enumOf(['email', 'phone', 'linkedin', 'calendar'], {
          description: 'Which channel to highlight first.',
        }),
        message: markdown({
          description: 'A short invitation to get in touch, shown above the links.',
        }),
        formAction: url({
          description: 'Posts the contact form to this endpoint (Formspree, Netlify, …).',
        }),
        calendarUrl: url({ description: 'Scheduling link.', example: 'https://cal.com/you/intro' }),
        links: linkMap('Extra contact links: `imprint`, `matrix`, `signal`, …'),
      }),

      social: linkMap('Social profiles. The key is the network: `github`, `linkedin`, `mastodon`, …'),

      skills: list(
        obj(
          {
            name: str({ required: true, description: 'Skill or area of expertise.' }),
                category: str({ description: 'Group heading. Skills with the same category are listed together.' }),
                level: enumOf(SKILL_LEVELS, { description: 'Used by templates that draw a level.' }),
                years: num({ description: 'Years of experience with this skill.', min: 0, max: 80 }),
                description: str({ description: 'One line of context.' }),
                keywords: strList({ description: 'Related technologies.' }),
            featured: bool({ description: 'Show this skill first.' }),
          },
          { from: 'name', label: 'skill' },
        ),
        { unique: 'name' },
      ),

      languages: list(
        obj(
          {
            name: str({ required: true, description: 'Programming language.' }),
            level: enumOf(SKILL_LEVELS, { description: 'How confident you are with it.' }),
            years: num({ description: 'Years of experience.' }),
            description: str({ description: 'Where you have used it.' }),
            url: url({ description: 'Documentation or home page.' }),
          },
          { from: 'name', label: 'language' },
        ),
        { unique: 'name', description: 'Programming languages you work with.' },
      ),

      spokenLanguages: list(
        anyOf(
          [
            str({ label: 'language name' }),
            obj(
              {
                name: str({ required: true, description: 'Spoken language.' }),
                proficiency: enumOf(PROFICIENCY, { description: 'How fluent you are.' }),
                description: str({ description: 'Certification or context.' }),
              },
              { from: 'name' },
            ),
          ],
          { label: 'spoken language' },
        ),
        { unique: 'name' },
      ),

      technologies: nameList(
        {
          url: url({ description: 'Project or documentation page.' }),
          category: str({ description: 'Grouping used by tag-cloud layouts.' }),
        },
        { unique: 'name', description: 'Tools, platforms and frameworks.' },
      ),

      projects: list(
        obj(
          {
            name: str({
              required: true,
              description: 'Project name.',
              example: 'EricSearch',
            }),
            id: str({
              description: 'Slug used in the URL and image alt text. Derived from the name when omitted.',
              aliases: ['slug'],
              patternHint: 'Use lower case letters, numbers and dashes, e.g. `eric-search`.',
            }),
            tagline: str({ description: 'One line shown on the card.' }),
            description: str({
              description: 'Two or three sentences shown on the card and in search results.',
            }),
            details: markdown({
              description: 'The long write-up rendered on the project page.',
            }),
            features: strList({ description: 'Feature bullets shown on the card and detail page.' }),
            highlights: strList({ description: 'Alias of `features` for people who prefer the word.' }),
            technologies: nameList(
              {
                url: url({ description: 'Project or documentation page.' }),
                category: str({ description: 'Grouping used by tag-cloud layouts.' }),
                level: enumOf(SKILL_LEVELS, { description: 'How deeply you know it.' }),
              },
              { description: 'Stack used by the project.' },
            ),
            images: list(image, { description: 'Screenshots. The first one is used as the card image.' }),
            cover: image,
            github: url({
              description: 'Repository URL.',
              aliases: ['repository', 'repo', 'source'],
              example: 'https://github.com/you/project',
            }),
            liveUrl: url({
              description: 'Deployed project.',
              aliases: ['url', 'website', 'demo', 'homepage'],
            }),
            links: linkMap('Extra links: `docs`, `paper`, `design`, …'),
            start: date({ description: 'When the project started.', aliases: ['date', 'year'], example: '2024-01' }),
            end: date({ description: 'When it ended, or `present`.' }),
            status: enumOf(PROJECT_STATUS, { description: 'Lifecycle badge.' }),
            license: str({ description: 'Licence the project is released under.', example: 'MIT' }),
            role: str({ description: 'Your role, e.g. `Creator` or `Maintainer`.' }),
            team: str({ description: 'Who else worked on it.' }),
            metrics: list(
              obj({
                label: str({ required: true, description: 'What the number measures.' }),
                value: str({ required: true, description: 'The number itself: `1.2k`, `40%`, `3×`.' }),
              }),
              { unique: 'label', description: 'A few numbers that make the result concrete.' },
            ),
            tags: strList({ description: 'Free-form tags used by the project filter.' }),
            featured: bool({ description: 'Highlight on the home page.' }),
            order: num({ description: 'Lower numbers sort first.' }),
            draft: bool({ description: 'Keep the project out of the build.' }),
          },
          { required: true },
        ),
        { unique: 'id', description: 'Things you built. Each one gets a card and a detail page.' },
      ),

      experience: list(
        obj(
          {
            company: str({
              required: true,
              description: 'Organisation name.',
              aliases: ['organization', 'employer'],
            }),
            role: str({
              required: true,
              description: 'Your title there.',
              aliases: ['title', 'position'],
            }),
            companyUrl: url({ description: 'Organisation website.', aliases: ['companyWebsite'] }),
            employmentType: enumOf(EMPLOYMENT_TYPES, { description: 'Kind of contract.' }),
            workMode: enumOf(WORK_MODES, { description: 'On-site, hybrid or remote.' }),
            summary: str({ description: 'One line describing the role.' }),
            technologies: nameList(
              {
                url: url({ description: 'Project or documentation page.' }),
                category: str({ description: 'Grouping used by tag-cloud layouts.' }),
                level: enumOf(SKILL_LEVELS, { description: 'How deeply you know it.' }),
              },
              { description: 'Stack you worked with.' },
            ),
            skills: strList({ description: 'Skills you used, when they are not technologies.' }),
            companyLogo: str({ description: 'Path to a logo image.' }),
            ...entryBase,
          },
          { required: true },
        ),
        { unique: 'role', description: 'Jobs, freelance work and volunteering, newest first.' },
      ),

      education: list(
        obj(
          {
            institution: str({
              required: true,
              description: 'School, university or course provider.',
              aliases: ['school', 'university'],
            }),
            degree: str({ description: 'Degree or qualification.', aliases: ['studyType', 'qualification'] }),
            institutionUrl: url({ description: 'Institution website.', aliases: ['schoolUrl'] }),
            summary: str({ description: 'One line about the degree.' }),
            field: str({ description: 'Field of study.', aliases: ['area', 'fieldOfStudy', 'major'] }),
            grade: str({ description: 'Grade or GPA, printed as written.' }),
            activities: strList({ description: 'Clubs, societies, roles.' }),
            courses: strList({ description: 'Relevant courses.' }),
            ...entryBase,
          },
          { required: true },
        ),
        { unique: 'institution', description: 'Degrees, courses and other formal learning.' },
      ),

      certifications: list(
        obj(
          {
            name: str({ required: true, description: 'Certification name.' }),
            issuer: str({
              required: true,
              description: 'Who issued it.',
              aliases: ['organization', 'provider', 'authority'],
            }),
            date: date({ description: 'When it was issued.', aliases: ['issued', 'issueDate'] }),
            expires: date({ description: 'Expiry date, if it has one.', aliases: ['expiryDate'] }),
            credentialId: str({ description: 'Credential or licence number.', aliases: ['licenseNumber'] }),
            credentialUrl: url({ description: 'Verification link.', aliases: ['verifyUrl', 'url'] }),
            logo: str({ description: 'Path to the issuer logo.' }),
            skills: strList({ description: 'What the certification covers.' }),
            description: markdown({ description: 'Extra context.' }),
          },
          { required: true },
        ),
        { unique: 'name', description: 'Certifications and licences, newest first.' },
      ),

      awards: list(
        obj(
          {
            title: str({ required: true, description: 'Award name.' }),
            issuer: str({ description: 'Who gave it.', aliases: ['organization', 'awarder'] }),
            date: date({ description: 'When it was received.' }),
            summary: str({ description: 'Why it was awarded.', aliases: ['description'] }),
            url: url({ description: 'Announcement or certificate.' }),
          },
          { required: true },
        ),
        { unique: 'title' },
      ),

      publications: list(
        obj(
          {
            title: str({ required: true, description: 'Paper, article or talk title.' }),
            publisher: str({ description: 'Journal, conference or venue.', aliases: ['venue', 'journal'] }),
            date: date({ description: 'Publication date.' }),
            authors: strList({ description: 'Author list, in order.' }),
            url: url({ description: 'Link to the publication.', aliases: ['link'] }),
            doi: str({ description: 'DOI identifier.' }),
            summary: str({ description: 'One line abstract.', aliases: ['abstract'] }),
          },
          { required: true },
        ),
        { unique: 'title' },
      ),

      testimonials: list(
        obj(
          {
            quote: str({ required: true, description: 'What they said.', aliases: ['text'] }),
            author: str({ required: true, description: 'Who said it.' }),
            role: str({ description: 'Their role.', aliases: ['title', 'position'] }),
            company: str({ description: 'Their company.', aliases: ['organization'] }),
            avatar: image,
            url: url({ description: 'Source of the quote.' }),
          },
          { required: true },
        ),
        { unique: 'author' },
      ),

      sections: list(
        obj(
          {
            id: str({ description: 'Stable id used for the anchor. Derived from the title when omitted.' }),
            title: str({ required: true, description: 'Section heading.' }),
            subtitle: str({ description: 'Small line under the heading.' }),
            icon: str({ description: `Icon name. One of the built-in set, or \`${HOST_KEYS.length}\` host icons.` }),
            layout: enumOf(SECTION_LAYOUTS, {
              description: 'How the items are rendered. Defaults to `prose` for text-only sections.',
              valueAliases: [
                { value: 'cards', aliases: ['grid', 'card'] },
                { value: 'timeline', aliases: ['history', 'milestones'] },
                { value: 'list', aliases: ['bullets'] },
                { value: 'links', aliases: ['link-grid'] },
                { value: 'stats', aliases: ['numbers', 'metrics'] },
                { value: 'prose', aliases: ['text', 'markdown'] },
                { value: 'gallery', aliases: ['images', 'photos'] },
              ],
            }),
            content: markdown({ description: 'Free-form text. Used by the `prose` layout.' }),
            items: list(
              obj({
                title: str({ description: 'Item heading. Defaults to `label` for stats items.' }),
                label: str({ description: 'Caption used by the `stats` layout.' }),
                value: str({ description: 'Big number used by the `stats` layout.' }),
                subtitle: str({ description: 'Item subheading.' }),
                description: markdown({ description: 'Item body.' }),
                date: date({ description: 'Date shown on timeline entries.' }),
                url: url({ description: 'Makes the whole item a link.' }),
                icon: str({ description: 'Icon name.' }),
                image: image,
                tags: strList({ description: 'Tags shown as chips.' }),
                links: linkMap('Links rendered as buttons or rows.'),
                metrics: list(
                  obj({ label: str({ required: true }), value: str({ required: true }) }),
                ),
              }),
              { required: true },
            ),
            order: num({ description: 'Where the section sits in the page. Custom sections follow the built-in ones by default.' }),
            hidden: bool({ description: 'Keep the section in the document but out of the site.' }),
            draft: bool({ description: 'Same as `hidden`, for work in progress.' }),
          },
          { required: true },
        ),
        { unique: 'id', description: 'Anything else you want to show, using one of the built-in layouts.' },
      ),

      extra: dict(strList(), {
        description: 'Extra key/value data available to custom templates as `doc.extra`.',
      }),
    },
    { description: 'The portfolio document.' },
  )
);

/** Sections whose content is a list of entries. */
export const SECTION_COLLECTIONS = /** @type {const} */ ([
  'projects',
  'experience',
  'education',
  'certifications',
  'awards',
  'publications',
  'testimonials',
  'skills',
  'languages',
  'spokenLanguages',
  'technologies',
  'sections',
]);

export { PROJECT_STATUS, AVAILABILITY, PROFICIENCY, SECTION_LAYOUTS, WORK_MODES };
