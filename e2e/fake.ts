import { faker } from '@faker-js/faker';

export const fake = {
  person: () => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    };
  },
  personName: () => faker.person.fullName(),
  projectTitle: () => faker.company.catchPhrase(),
  skillCategory: () => `${faker.word.adjective()} ${faker.word.noun()}`,
  skillName: () => `${faker.word.adjective()} ${faker.word.noun()}`,
  starterTaskTitle: () => `${faker.word.verb()} ${faker.word.noun()} ${faker.word.noun()}`,
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
};
