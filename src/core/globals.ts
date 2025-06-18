export namespace Globals {

    export class Roles {
        public static readonly User = "User";
        public static readonly Admin = "Admin";
    }

    export class ClaimTypes {

        public static readonly UserId = "http://gaddr.com/claims/sub";
        public static readonly Email = "http://gaddr.com/claims/email";
        public static readonly SecurityStamp = "http://gaddr.com/claims/securitystamp";
        public static readonly ConcurrencyStamp = "http://gaddr.com/claims/concurrencystamp";
        public static readonly UserType = "http://gaddr.com/claims/usertype";
        public static readonly GivenName = "http://gaddr.com/claims/givenname";
        public static readonly FamilyName = "http://gaddr.com/claims/familyname";
        public static readonly FullName = "http://gaddr.com/claims/fullname";
        public static readonly Role = "http://gaddr.com/claims/role";

        public static readonly Permission = "permission";
    }
} 