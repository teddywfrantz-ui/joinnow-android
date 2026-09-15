export interface GroupEligibilityMember {
  gender: string | null;
  birthday: Date | null;
}

export interface GroupEligibilityMeetup {
  genderFilter: string | null;
  minAgeFilter: number | null;
  maxAgeFilter: number | null;
}

function ageForBirthday(birthday: Date, now = new Date()): number {
  let age = now.getFullYear() - birthday.getFullYear();
  const monthDelta = now.getMonth() - birthday.getMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getDate() < birthday.getDate())
  ) {
    age -= 1;
  }
  return age;
}

/**
 * Group acceptance is all-or-nothing: this function returns an explanation
 * when any one member cannot join the meetup, and null when everyone can.
 */
export function groupEligibilityError(
  members: GroupEligibilityMember[],
  meetup: GroupEligibilityMeetup,
  now = new Date(),
): string | null {
  for (const member of members) {
    if (
      meetup.genderFilter &&
      meetup.genderFilter !== "All" &&
      member.gender !== meetup.genderFilter
    ) {
      return "Every group member must meet the meetup gender requirements";
    }
    if (meetup.minAgeFilter !== null || meetup.maxAgeFilter !== null) {
      if (!member.birthday) {
        return "Every group member must have a birthday for this age-restricted meetup";
      }
      const age = ageForBirthday(member.birthday, now);
      if (meetup.minAgeFilter !== null && age < meetup.minAgeFilter) {
        return "Every group member must meet the meetup minimum age";
      }
      if (meetup.maxAgeFilter !== null && age > meetup.maxAgeFilter) {
        return "Every group member must meet the meetup maximum age";
      }
    }
  }
  return null;
}

export function hasCapacity(
  existingParticipantCount: number,
  newMemberCount: number,
  maxParticipants: number,
): boolean {
  return existingParticipantCount + newMemberCount <= maxParticipants;
}
