import { faker } from '@faker-js/faker'
import { createHash } from 'node:crypto'

/**
 * Seed the generator from a test's project and title, so the same test always
 * makes the same people, projects and prose, and no two tests, nor one test
 * in two lanes, share a sequence. The names still read as real names; only
 * their choice is fixed.
 */
export function seedFake(title: string): void {
  faker.seed(createHash('sha1').update(title).digest().readUInt32BE(0))
}

export const fake = {
  person: () => {
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    return {
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    }
  },
  personName: () => faker.person.fullName(),
  projectTitle: () => faker.company.catchPhrase(),
  skillCategory: () => `${faker.word.adjective()} ${faker.word.noun()}`,
  skillName: () => `${faker.word.adjective()} ${faker.word.noun()}`,
  quickTaskTitle: () => `${faker.word.verb()} ${faker.word.noun()} ${faker.word.noun()}`,
  bugTitle: () => faker.lorem.sentence(),
  note: () => faker.lorem.sentence(),
  messageSubject: () => faker.lorem.words(4),
  messageBody: () => faker.lorem.paragraph(),
  feedbackText: () => faker.lorem.sentence(),
  progressUpdate: () => faker.lorem.sentence(),
  outcomeNotes: () => faker.lorem.sentence(),
  resolutionNotes: () => faker.lorem.sentence(),
  uniqueEmail: () => faker.internet.email().toLowerCase(),
  username: () => faker.internet.username(),
  phoneNumber: () => faker.phone.number({ style: 'international' }),
  localGroupName: () => faker.location.city(),
  teamName: () => `${faker.word.adjective()} ${faker.word.noun()} Squad`,
}
