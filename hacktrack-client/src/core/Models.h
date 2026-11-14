// Domain records. Collections inside records use the project's own structures
// (DynArray, SinglyList) rather than STL containers.
#pragma once
#include <string>

#include "../ds/DynArray.h"
#include "../ds/GeneralizedList.h"
#include "../ds/SinglyList.h"
#include "json.hpp"

namespace ht {

using json = nlohmann::json;

struct User {
    std::string id, name, email, role, handle, country, teamId, judgeId;
};

struct Session {
    std::string token;
    User user;
    long long cachedAtMs = 0;
};

struct Member {
    std::string userId, name, handle, role, country, initials;
};

struct Team {
    std::string id, name, inviteCode, createdAt;
    int projectId = 0;  // 0 = no project yet
    SinglyList<Member> members;  // Unit 2: singly linked list
};

struct Project {
    int id = 0;
    std::string code, slug, name, tagline, description, trackId, teamId, status, submittedAt, updatedAt, repo, demo;
    DynArray<std::string> stack;
};

struct Judge {
    std::string id, userId, name, handle, title;
};

struct ScoreEntry {
    std::string criterion;
    double value = 0;
};

struct Assignment {
    std::string judgeId;
    int projectId = 0;
    std::string status = "not_started";
    DynArray<ScoreEntry> scores;
    int confidence = 3;
    std::string notes, submittedAt, updatedAt;

    bool score(const std::string& id, double& out) const {
        for (const ScoreEntry& s : scores) if (s.criterion == id) { out = s.value; return true; }
        return false;
    }
};

struct Event {
    std::string name, tagline, startsAt, deadline, resultsAt;
    bool judgingOpen = false, votingOpen = false, resultsPublished = false;
    int judgesPerProject = 3, maxTeamSize = 4, votesPerUser = 3;
};

struct Conflict {
    std::string judgeId, teamId, reason;
};

struct Vote {
    std::string userId;
    int projectId = 0;
    std::string createdAt;
};

// ── JSON <-> record conversion (protocol boundary only) ──────

User userFrom(const json& j);
json toJson(const User& u);
Team teamFrom(const json& j);
json toJson(const Team& t);
Project projectFrom(const json& j);
json toJson(const Project& p);
Judge judgeFrom(const json& j);
json toJson(const Judge& j);
Assignment assignmentFrom(const json& j);
json toJson(const Assignment& a);
Event eventFrom(const json& j);
json toJson(const Event& e);
Conflict conflictFrom(const json& j);
Vote voteFrom(const json& j);

/// Build the generalized list from the server's nested rubric JSON.
void rubricFrom(const json& nodes, GeneralizedList& out);
/// Rubric JSON annotated with each leaf's effective weight (computed by the list).
json rubricToJson(const json& nodes, const GeneralizedList& g);

std::string jstr(const json& j, const char* key);

}  // namespace ht
