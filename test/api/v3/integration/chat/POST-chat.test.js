import {
  createAndPopulateGroup,
  translate as t,
  sleep,
  server,
} from '../../../../helpers/api-v3-integration.helper';
import {
  SPAM_MESSAGE_LIMIT,
  SPAM_MIN_EXEMPT_CONTRIB_LEVEL,
  TAVERN_ID,
} from '../../../../../website/server/models/group';
import { v4 as generateUUID } from 'uuid';

describe('POST /chat', () => {
  let user, groupWithChat, member, additionalMember;
  let testMessage = 'Test Message';
  let testBannedWordMessage = 'TEST_PLACEHOLDER_SWEAR_WORD_HERE';

  before(async () => {
    let { group, groupLeader, members } = await createAndPopulateGroup({
      groupDetails: {
        name: 'Test Guild',
        type: 'guild',
        privacy: 'public',
      },
      members: 2,
    });

    user = groupLeader;
    groupWithChat = group;
    member = members[0];
    additionalMember = members[1];
  });

  it('Returns an error when no message is provided', async () => {
    await expect(user.post(`/groups/${groupWithChat._id}/chat`, { message: ''}))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('invalidReqParams'),
      });
  });

  it('Returns an error when an empty message is provided', async () => {
    await expect(user.post(`/groups/${groupWithChat._id}/chat`, { message: '    '}))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('invalidReqParams'),
      });
  });

  it('Returns an error when an message containing only newlines is provided', async () => {
    await expect(user.post(`/groups/${groupWithChat._id}/chat`, { message: '\n\n'}))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('invalidReqParams'),
      });
  });

  it('Returns an error when group is not found', async () => {
    await expect(user.post('/groups/invalidID/chat', { message: testMessage})).to.eventually.be.rejected.and.eql({
      code: 404,
      error: 'NotFound',
      message: t('groupNotFound'),
    });
  });

  it('returns an error when chat privileges are revoked when sending a message to a public guild', async () => {
    let userWithChatRevoked = await member.update({'flags.chatRevoked': true});
    await expect(userWithChatRevoked.post(`/groups/${groupWithChat._id}/chat`, { message: testMessage})).to.eventually.be.rejected.and.eql({
      code: 404,
      error: 'NotFound',
      message: 'Your chat privileges have been revoked.',
    });
  });

  context('banned word', () => {
    it('returns an error when chat message contains a banned word in tavern', async () => {
      await expect(user.post('/groups/habitrpg/chat', { message: testBannedWordMessage}))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('bannedWordUsed'),
      });
    });

    it('errors when word is part of a phrase', async () => {
      let wordInPhrase = `phrase ${testBannedWordMessage} end`;
      await expect(user.post('/groups/habitrpg/chat', { message: wordInPhrase}))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('bannedWordUsed'),
      });
    });

    it('errors when word is surrounded by non alphabet characters', async () => {
      let wordInPhrase = `_!${testBannedWordMessage}@_`;
      await expect(user.post('/groups/habitrpg/chat', { message: wordInPhrase}))
      .to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('bannedWordUsed'),
      });
    });

    it('does not error when bad word is suffix of a word', async () => {
      let wordAsSuffix = `prefix${testBannedWordMessage}`;
      let message = await user.post('/groups/habitrpg/chat', { message: wordAsSuffix});

      expect(message.message.id).to.exist;
    });

    it('does not error when bad word is prefix of a word', async () => {
      let wordAsPrefix = `${testBannedWordMessage}suffix`;
      let message = await user.post('/groups/habitrpg/chat', { message: wordAsPrefix});

      expect(message.message.id).to.exist;
    });

    it('does not error when sending a chat message containing a banned word to a party', async () => {
      let { group, members } = await createAndPopulateGroup({
        groupDetails: {
          name: 'Party',
          type: 'party',
          privacy: 'private',
        },
        members: 1,
      });

      let message = await members[0].post(`/groups/${group._id}/chat`, { message: testBannedWordMessage});

      expect(message.message.id).to.exist;
    });

    it('does not error when sending a chat message containing a banned word to a public guild', async () => {
      let { group, members } = await createAndPopulateGroup({
        groupDetails: {
          name: 'public guild',
          type: 'guild',
          privacy: 'public',
        },
        members: 1,
      });

      let message = await members[0].post(`/groups/${group._id}/chat`, { message: testBannedWordMessage});

      expect(message.message.id).to.exist;
    });

    it('does not error when sending a chat message containing a banned word to a private guild', async () => {
      let { group, members } = await createAndPopulateGroup({
        groupDetails: {
          name: 'private guild',
          type: 'guild',
          privacy: 'private',
        },
        members: 1,
      });

      let message = await members[0].post(`/groups/${group._id}/chat`, { message: testBannedWordMessage});

      expect(message.message.id).to.exist;
    });
  });

  it('does not error when sending a message to a private guild with a user with revoked chat', async () => {
    let { group, members } = await createAndPopulateGroup({
      groupDetails: {
        name: 'Private Guild',
        type: 'guild',
        privacy: 'private',
      },
      members: 1,
    });

    let privateGuildMemberWithChatsRevoked = members[0];
    await privateGuildMemberWithChatsRevoked.update({'flags.chatRevoked': true});

    let message = await privateGuildMemberWithChatsRevoked.post(`/groups/${group._id}/chat`, { message: testMessage});

    expect(message.message.id).to.exist;
  });

  it('does not error when sending a message to a party with a user with revoked chat', async () => {
    let { group, members } = await createAndPopulateGroup({
      groupDetails: {
        name: 'Party',
        type: 'party',
        privacy: 'private',
      },
      members: 1,
    });

    let privatePartyMemberWithChatsRevoked = members[0];
    await privatePartyMemberWithChatsRevoked.update({'flags.chatRevoked': true});

    let message = await privatePartyMemberWithChatsRevoked.post(`/groups/${group._id}/chat`, { message: testMessage});

    expect(message.message.id).to.exist;
  });

  it('creates a chat', async () => {
    let message = await user.post(`/groups/${groupWithChat._id}/chat`, { message: testMessage});

    expect(message.message.id).to.exist;
  });

  it('sends group chat received webhooks', async () => {
    let userUuid = generateUUID();
    let memberUuid = generateUUID();
    await server.start();

    await user.post('/user/webhook', {
      url: `http://localhost:${server.port}/webhooks/${userUuid}`,
      type: 'groupChatReceived',
      enabled: true,
      options: {
        groupId: groupWithChat.id,
      },
    });
    await member.post('/user/webhook', {
      url: `http://localhost:${server.port}/webhooks/${memberUuid}`,
      type: 'groupChatReceived',
      enabled: true,
      options: {
        groupId: groupWithChat.id,
      },
    });

    let message = await user.post(`/groups/${groupWithChat._id}/chat`, { message: testMessage });

    await sleep();

    await server.close();

    let userBody = server.getWebhookData(userUuid);
    let memberBody = server.getWebhookData(memberUuid);

    [userBody, memberBody].forEach((body) => {
      expect(body.group.id).to.eql(groupWithChat._id);
      expect(body.group.name).to.eql(groupWithChat.name);
      expect(body.chat).to.eql(message.message);
    });
  });

  it('notifies other users of new messages for a guild', async () => {
    let message = await user.post(`/groups/${groupWithChat._id}/chat`, { message: testMessage});
    let memberWithNotification = await member.get('/user');

    expect(message.message.id).to.exist;
    expect(memberWithNotification.newMessages[`${groupWithChat._id}`]).to.exist;
  });

  it('notifies other users of new messages for a party', async () => {
    let { group, groupLeader, members } = await createAndPopulateGroup({
      groupDetails: {
        name: 'Test Party',
        type: 'party',
        privacy: 'private',
      },
      members: 1,
    });

    let message = await groupLeader.post(`/groups/${group._id}/chat`, { message: testMessage});
    let memberWithNotification = await members[0].get('/user');

    expect(message.message.id).to.exist;
    expect(memberWithNotification.newMessages[`${group._id}`]).to.exist;
  });

  context('Spam prevention', () => {
    it('Returns an error when the user has been posting too many messages', async () => {
      // Post as many messages are needed to reach the spam limit
      for (let i = 0; i < SPAM_MESSAGE_LIMIT; i++) {
        let result = await additionalMember.post(`/groups/${TAVERN_ID}/chat`, { message: testMessage }); // eslint-disable-line no-await-in-loop
        expect(result.message.id).to.exist;
      }

      await expect(additionalMember.post(`/groups/${TAVERN_ID}/chat`, { message: testMessage })).to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('messageGroupChatSpam'),
      });
    });

    it('contributor should not receive spam alert', async () => {
      let userSocialite = await member.update({'contributor.level': SPAM_MIN_EXEMPT_CONTRIB_LEVEL, 'flags.chatRevoked': false});

      // Post 1 more message than the spam limit to ensure they do not reach the limit
      for (let i = 0; i < SPAM_MESSAGE_LIMIT + 1; i++) {
        let result = await userSocialite.post(`/groups/${TAVERN_ID}/chat`, { message: testMessage }); // eslint-disable-line no-await-in-loop
        expect(result.message.id).to.exist;
      }
    });
  });
});
