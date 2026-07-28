const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super-secret-key';
const JWT_ISSUER = 'http://localhost:5000';
const JWT_AUDIENCE = 'http://localhost:5000';

function generateToken(userId, email) {
  return jwt.sign(
    {
      'http://gaddr.com/claims/sub': userId,
      'http://gaddr.com/claims/email': email,
      'http://gaddr.com/claims/usertype': 'User',
      'http://gaddr.com/claims/roles': ['User'],
      'http://gaddr.com/claims/username': email.split('@')[0],
      'http://gaddr.com/claims/givenname': 'Test',
      'http://gaddr.com/claims/familyname': 'User',
      'http://gaddr.com/claims/fullname': 'Test User',
      'http://gaddr.com/claims/security-stamp': 'test-stamp',
      'http://gaddr.com/claims/concurrency-stamp': 'test-concurrency',
    },
    JWT_SECRET,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '7d' }
  );
}

// User 1: Sambhav Jain (owner of UserContent we'll use)
const token1 = generateToken('e0a4e077-a8c3-47b0-961b-c7a6b5859e8e', 'jainsam623@gmail.com');

// User 2: Utkarsh (for member tests)
const token2 = generateToken('f88f2cd2-1c26-490e-a528-377e46f9a221', 'utkarsh7trivedi@gmail.com');

console.log('TOKEN_USER1=' + token1);
console.log('TOKEN_USER2=' + token2);
