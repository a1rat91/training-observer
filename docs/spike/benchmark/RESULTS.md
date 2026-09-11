# Фактические результаты benchmark

Сгенерировано 2026-09-11T20:35:43.800Z. 28 целей × 17 вариантов × 5 методов = 2380 проверок.

| Метод           | Correct | Wrong | Ambiguous | Broken |         Recovery |        Precision |
| --------------- | ------: | ----: | --------: | -----: | ---------------: | ---------------: |
| resolver-v2     |     368 |     1 |        58 |     49 | 368/369 (99.73%) | 368/369 (99.73%) |
| finder-default  |     317 |    56 |        22 |     81 | 317/369 (85.91%) | 317/373 (84.99%) |
| finder-filtered |     322 |    55 |        23 |     76 | 322/369 (87.26%) | 322/377 (85.41%) |
| dom-to-locator  |     365 |    57 |        24 |     30 | 365/369 (98.92%) | 365/422 (86.49%) |
| mizchi          |     361 |    49 |        26 |     40 | 361/369 (97.83%) | 361/410 (88.05%) |

## Resolver по изменениям

| Изменение           | Correct | Wrong | Ambiguous | Broken |
| ------------------- | ------: | ----: | --------: | -----: |
| fresh-document      |      25 |     0 |         2 |      1 |
| wrappers            |      25 |     0 |         2 |      1 |
| reorder             |      25 |     0 |         2 |      1 |
| classes             |      25 |     0 |         2 |      1 |
| nesting             |      25 |     0 |         2 |      1 |
| button-content      |      25 |     0 |         2 |      1 |
| move-container      |      25 |     0 |         2 |      1 |
| regenerated-ids     |      25 |     0 |         2 |      1 |
| combined-17         |      25 |     0 |         2 |      1 |
| combined-83         |      25 |     0 |         2 |      1 |
| rename              |      24 |     0 |         2 |      2 |
| duplicate           |       0 |     0 |        28 |      0 |
| removed             |       0 |     0 |         0 |     28 |
| lost-context        |      21 |     0 |         2 |      5 |
| css-trap            |      25 |     0 |         2 |      1 |
| semantic-trap       |      24 |     0 |         2 |      2 |
| same-dom-new-entity |      24 |     1 |         2 |      1 |

## Динамические переходы

- new-document-layout: 8 correct, 0 wrong, 0 ambiguous, 0 broken (8 доступных, 0 отсутствующих).
- before-append: 0 correct, 0 wrong, 0 ambiguous, 2 broken (0 доступных, 2 отсутствующих).
- pending-http: 0 correct, 0 wrong, 0 ambiguous, 2 broken (0 доступных, 2 отсутствующих).
- after-append: 10 correct, 0 wrong, 0 ambiguous, 0 broken (10 доступных, 0 отсутствующих).
- portal-open-owner: 1 correct, 0 wrong, 0 ambiguous, 0 broken (1 доступных, 0 отсутствующих).
- portal-closed-owner: 1 correct, 0 wrong, 0 ambiguous, 0 broken (1 доступных, 0 отсутствующих).
- after-replace: 4 correct, 0 wrong, 0 ambiguous, 0 broken (4 доступных, 0 отсутствующих).
- removed-after-replace: 0 correct, 0 wrong, 0 ambiguous, 2 broken (0 доступных, 2 отсутствующих).
- reset: 0 correct, 0 wrong, 0 ambiguous, 6 broken (0 доступных, 6 отсутствующих).
- validation-422: 5 correct, 0 wrong, 0 ambiguous, 0 broken (5 доступных, 0 отсутствующих).

Методика и интерпретация: [benchmark.md](../benchmark.md). Полные данные: [report.json](report.json),
[results.csv](results.csv), [dynamic.csv](dynamic.csv).
