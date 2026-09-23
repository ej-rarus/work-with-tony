# Pre-publish check

Questions asked of every draft before it is published. Each one gets a verdict, **PASS** or **FLAG**, and a one-line reason that points at the draft (quote at most a few words).

A FLAG does not block publishing. It is shown under the draft, and if the user says "올려" while a FLAG is still open, confirm once more before running the script.

If `$LINKEDIN_POST_HOME/publish-check.md` exists it replaces this file. Put questions derived from your own post statistics there; this default ships with the plugin and stays generic.

## reader-owns-it

Would a reader read this as being about their own work, career, or decisions?

- PASS: the subject is the reader's job, a decision they also face, or a change in their field. Your own experience is fine as the vehicle, as long as the point lands on something the reader also has.
- FLAG: the subject is only your team's internal situation, only a tool or product announcement with no stake for the reader, or a self-introduction.
- Fix hint: name the reader's version of the problem in the first two lines.

## takeaway

After reading, does the reader leave with something they can use?

- PASS: a checklist, a rule they can adopt, a number they did not know, a file or link, or a concrete method.
- FLAG: an observation or feeling with nothing to take away, or a pitch where the only action is to hire or contact you.
- Fix hint: add the one thing you would hand a colleague who asked "so what do I do?".
